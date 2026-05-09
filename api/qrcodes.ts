import { supabaseServer } from './_supabaseServer.js';
import { getUserFromAuthHeader } from './utils/auth.js';
import QRCode from 'qrcode';

// Node.js runtime required for the 'qrcode' package (not Edge-compatible).
// NOTE: This file must not share imports with Edge-runtime handlers to avoid
// pulling Node.js APIs into an Edge context.
export const config = { runtime: 'nodejs' };

/**
 * Generate a secure stable QR code ID using CSPRNG with rejection sampling
 * to eliminate modulo bias.
 */
function generateSecureId(length: number, chars: string): string {
  const limit = 256 - (256 % chars.length); // rejection threshold to eliminate modulo bias
  let result = '';
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < limit) {
        result += chars[byte % chars.length];
        if (result.length === length) break;
      }
    }
  }
  return result;
}

function generateStableId(): string {
  return 'qr-' + generateSecureId(8, 'abcdefghijklmnopqrstuvwxyz0123456789');
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  
  // GET - Retrieve QR code for a form (authentication required)
  if (req.method === 'GET') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const formId = url.searchParams.get('formId');
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400 });
    }

    // Verify the form belongs to the requesting user
    const { data: formOwner, error: ownerError } = await supabaseServer
      .from('forms')
      .select('user_id')
      .eq('id', formId)
      .maybeSingle();

    if (ownerError || !formOwner || formOwner.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 });
    }

    try {
      const { data, error } = await supabaseServer
        .from('form_qrcodes')
        .select('*')
        .eq('form_id', formId)
        .maybeSingle();

      if (error) {
        console.error('QR code fetch error:', error);
        // If table doesn't exist, return 404 so client can generate
        if (error.message.includes('does not exist') || error.code === '42P01') {
          return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404 });
        }
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
      }

      if (!data) {
        return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404 });
      }

      return new Response(JSON.stringify({
        id: data.id,
        formId: data.form_id,
        qrCodeData: data.qr_code_data,
        stableId: data.stable_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }), { status: 200 });
    } catch (err: any) {
      console.error('QR code GET exception:', err);
      // Return 404 to allow client to generate
      return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404 });
    }
  }

  // POST - Generate QR code for a form
  if (req.method === 'POST') {
    try {
      const user = await getUserFromAuthHeader(req);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      const body = await req.json();
      const { formId, regenerate } = body;

      if (!formId) {
        return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400 });
      }

      // Verify the form belongs to the user
      const { data: formData, error: formError } = await supabaseServer
        .from('forms')
        .select('id, slug, user_id, qr_stable_id')
        .eq('id', formId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (formError || !formData) {
        console.error('Form fetch error:', formError);
        return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 });
      }

      // Check if QR code already exists
      const { data: existingQR } = await supabaseServer
        .from('form_qrcodes')
        .select('*')
        .eq('form_id', formId)
        .maybeSingle();

      if (existingQR && !regenerate) {
        return new Response(JSON.stringify({
          id: existingQR.id,
          formId: existingQR.form_id,
          qrCodeData: existingQR.qr_code_data,
          stableId: existingQR.stable_id,
          createdAt: existingQR.created_at,
          updatedAt: existingQR.updated_at
        }), { status: 200 });
      }

      // Generate stable ID (reuse existing or create new)
      let stableId = formData.qr_stable_id || existingQR?.stable_id;
      if (!stableId) {
        stableId = generateStableId();
        // Update form with stable ID
        await supabaseServer
          .from('forms')
          .update({ qr_stable_id: stableId })
          .eq('id', formId);
      }

      // Generate QR code URL pointing to the stable redirect endpoint
      // Use environment variable or hardcoded production URL for security
      const baseUrl = process.env.PUBLIC_URL || 'https://www.signflow.ink';
      const qrUrl = `${baseUrl}/qr/${stableId}`;

      // Generate QR code as a base64 PNG data URI server-side.
      // No external network call — uses the local 'qrcode' package.
      const qrCodeData = await QRCode.toDataURL(qrUrl, { width: 512, margin: 2 });

      // Store or update QR code in database
      const qrRecord = {
        form_id: formId,
        qr_code_data: qrCodeData,
        stable_id: stableId,
        updated_at: new Date().toISOString()
      };

      const { data: savedQR, error: saveError } = await supabaseServer
        .from('form_qrcodes')
        .upsert({
          ...qrRecord,
          id: existingQR?.id
        }, { onConflict: 'form_id' })
        .select()
        .maybeSingle();

      if (saveError) {
        console.error('QR code save error:', saveError);
        return new Response(JSON.stringify({ error: 'Failed to save QR code' }), { status: 500 });
      }

      return new Response(JSON.stringify({
        id: savedQR.id,
        formId: savedQR.form_id,
        qrCodeData: savedQR.qr_code_data,
        stableId: savedQR.stable_id,
        createdAt: savedQR.created_at,
        updatedAt: savedQR.updated_at
      }), { status: 200 });
    } catch (err: any) {
      console.error('QR code POST exception:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
    }
  }

  // DELETE - Delete and regenerate QR code
  if (req.method === 'DELETE') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const formId = url.searchParams.get('formId');
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400 });
    }

    // Verify the form belongs to the user
    const { data: formData, error: formError } = await supabaseServer
      .from('forms')
      .select('id, user_id')
      .eq('id', formId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (formError || !formData) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 });
    }

    // Delete existing QR code
    const { error: deleteError } = await supabaseServer
      .from('form_qrcodes')
      .delete()
      .eq('form_id', formId);

    if (deleteError) {
      console.error('QR code delete error:', deleteError);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
