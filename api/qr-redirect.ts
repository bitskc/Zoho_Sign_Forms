import { supabaseServer } from './_supabaseServer.js';
import { checkRateLimit, createRateLimitResponse, getRateLimitKey, RATE_LIMITS } from './utils/rateLimiter.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const rateLimitResult = checkRateLimit(`${getRateLimitKey(req)}:qr-redirect`, RATE_LIMITS.QR_REDIRECT);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Extract stable ID from path (e.g., /qr/qr-abc123 or /api/qr-redirect?id=qr-abc123)
    let stableId = url.searchParams.get('id');
    
    if (!stableId && pathSegments.length >= 2) {
      stableId = pathSegments[pathSegments.length - 1];
    }

    if (!stableId) {
      return new Response(JSON.stringify({ error: 'Missing QR code ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // Look up the form by stable ID
    const { data: formData, error: formError } = await supabaseServer
      .from('forms')
      .select('slug')
      .eq('qr_stable_id', stableId)
      .maybeSingle();

    if (formError || !formData) {
      return new Response(JSON.stringify({ error: 'QR code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const configuredPublicUrl = process.env.PUBLIC_URL || 'https://www.signflow.ink';
    const baseUrl = /^https?:\/\//i.test(configuredPublicUrl)
      ? configuredPublicUrl
      : 'https://www.signflow.ink';
    const redirectUrl = `${baseUrl}/${formData.slug}`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Cache-Control': 'no-store',
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
