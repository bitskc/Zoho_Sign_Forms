import { supabaseServer } from './_supabaseServer';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  
  // Extract stable ID from path (e.g., /qr/qr-abc123 or /api/qr-redirect?id=qr-abc123)
  let stableId = url.searchParams.get('id');
  
  if (!stableId && pathSegments.length >= 2) {
    // Extract from path
    stableId = pathSegments[pathSegments.length - 1];
  }

  if (!stableId) {
    return new Response(JSON.stringify({ error: 'Missing QR code ID' }), { status: 400 });
  }

  // Look up the form by stable ID
  const { data: formData, error: formError } = await supabaseServer
    .from('forms')
    .select('slug')
    .eq('qr_stable_id', stableId)
    .maybeSingle();

  if (formError || !formData) {
    return new Response(JSON.stringify({ error: 'QR code not found' }), { status: 404 });
  }

  // Build the redirect URL to the form slug
  // Use environment variable or hardcoded production URL for security
  const baseUrl = process.env.PUBLIC_URL || 'https://www.signflow.ink';
  const redirectUrl = `${baseUrl}/${formData.slug}`;

  // Return redirect response
  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirectUrl
    }
  });
}
