import { supabaseServer } from './_supabaseServer.js';
import { getUserFromAuthHeader } from './utils/auth.js';
import { checkRateLimit, createRateLimitResponse, getRateLimitKey, RATE_LIMITS } from './utils/rateLimiter.js';
import QRCode from 'qrcode';

// Node.js runtime required for the 'qrcode' package (not Edge-compatible).
// NOTE: This file must not share imports with Edge-runtime handlers to avoid
// pulling Node.js APIs into an Edge context.
export const config = { runtime: 'nodejs' };

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

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

function checkUserQrRateLimit(req: Request, userId: string): Response | null {
  const result = checkRateLimit(`${getRateLimitKey(req, userId)}:qrcodes`, RATE_LIMITS.QRCODES);
  return result.allowed ? null : createRateLimitResponse(result);
}

export default async function handler(req: Request) {
  const requestUrl = req.url.startsWith('http') ? req.url : `https://www.signflow.ink${req.url}`;
  const url = new URL(requestUrl);
  
  // GET - Retrieve QR code for a form (authentication required)
  if (req.method === 'GET') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
    }
    const rateLimitResponse = checkUserQrRateLimit(req, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const formId = url.searchParams.get('formId');
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400, headers: JSON_HEADERS });
    }

    // Verify the form belongs to the requesting user
    const { data: formOwner, error: ownerError } = await supabaseServer
      .from('forms')
      .select('user_id')
      .eq('id', formId)
      .maybeSingle();

    if (ownerError || !formOwner || formOwner.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404, headers: JSON_HEADERS });
    }

    try {
      const { data, error } = await supabaseServer
        .from('form_qrcodes')
        .select('id,form_id,qr_code_data,stable_id,created_at,updated_at')
        .eq('form_id', formId)
        .maybeSingle();

      if (error) {
        console.error('QR code fetch error:', error);
        // If table doesn't exist, return 404 so client can generate
          if (error.message.includes('does not exist') || error.code === '42P01') {
          return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404, headers: JSON_HEADERS });
        }
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: JSON_HEADERS });
      }

      if (!data) {
        return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404, headers: JSON_HEADERS });
      }

      return new Response(JSON.stringify({
        id: data.id,
        formId: data.form_id,
        qrCodeData: data.qr_code_data,
        stableId: data.stable_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }), { status: 200, headers: JSON_HEADERS });
    } catch (err: any) {
      console.error('QR code GET exception:', err);
      // Return 404 to allow client to generate
      return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404, headers: JSON_HEADERS });
    }
  }

  // POST - Generate QR code for a form
  if (req.method === 'POST') {
    try {
      const user = await getUserFromAuthHeader(req);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
      }
      const rateLimitResponse = checkUserQrRateLimit(req, user.id);
      if (rateLimitResponse) return rateLimitResponse;

      let body: any;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
      }
      const { formId, regenerate } = body;

      if (!formId) {
        return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400, headers: JSON_HEADERS });
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
        return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404, headers: JSON_HEADERS });
      }

      // Check if QR code already exists
      const { data: existingQR } = await supabaseServer
        .from('form_qrcodes')
        .select('id,form_id,qr_code_data,stable_id,created_at,updated_at')
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
        }), { status: 200, headers: JSON_HEADERS });
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
      const configuredPublicUrl = process.env.PUBLIC_URL || 'https://www.signflow.ink';
      const baseUrl = /^https?:\/\//i.test(configuredPublicUrl)
        ? configuredPublicUrl
        : 'https://www.signflow.ink';
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
        return new Response(JSON.stringify({ error: 'Failed to save QR code' }), { status: 500, headers: JSON_HEADERS });
      }

      return new Response(JSON.stringify({
        id: savedQR.id,
        formId: savedQR.form_id,
        qrCodeData: savedQR.qr_code_data,
        stableId: savedQR.stable_id,
        createdAt: savedQR.created_at,
        updatedAt: savedQR.updated_at
      }), { status: 200, headers: JSON_HEADERS });
    } catch (err: any) {
      console.error('QR code POST exception:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: JSON_HEADERS });
    }
  }

  // DELETE - Delete and regenerate QR code
  if (req.method === 'DELETE') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
    }
    const rateLimitResponse = checkUserQrRateLimit(req, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const formId = url.searchParams.get('formId');
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400, headers: JSON_HEADERS });
    }

    // Verify the form belongs to the user
    const { data: formData, error: formError } = await supabaseServer
      .from('forms')
      .select('id, user_id')
      .eq('id', formId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (formError || !formData) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404, headers: JSON_HEADERS });
    }

    // Delete existing QR code
    const { error: deleteError } = await supabaseServer
      .from('form_qrcodes')
      .delete()
      .eq('form_id', formId);

    if (deleteError) {
      console.error('QR code delete error:', deleteError);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
}
