import { supabaseServer } from './_supabaseServer';
import QRCode from 'qrcode';

export const config = { runtime: 'edge' };

async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// Generate a stable QR code ID
function generateStableId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'qr-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  
  // GET - Retrieve QR code for a form
  if (req.method === 'GET') {
    const formId = url.searchParams.get('formId');
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('form_qrcodes')
      .select('*')
      .eq('form_id', formId)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
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
  }

  // POST - Generate QR code for a form
  if (req.method === 'POST') {
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
    const origin = req.headers.get('origin') || 'https://zoho-sign-forms.vercel.app';
    const qrUrl = `${origin}/qr/${stableId}`;

    // Generate QR code as data URL
    const qrCodeData = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 512,
      margin: 2
    });

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
      return new Response(JSON.stringify({ error: saveError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({
      id: savedQR.id,
      formId: savedQR.form_id,
      qrCodeData: savedQR.qr_code_data,
      stableId: savedQR.stable_id,
      createdAt: savedQR.created_at,
      updatedAt: savedQR.updated_at
    }), { status: 200 });
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
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
