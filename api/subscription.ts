import { supabaseServer } from './_supabaseServer.js';
import { getUserFromAuthHeader } from './utils/auth.js';

// Subscription writes are intentionally restricted to the Stripe webhook handler only.
// POST and PUT are disabled here to prevent self-upgrade exploits.
// See api/stripe-webhook.ts for the authoritative subscription write path.
export const config = { runtime: 'edge' };

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

export default async function handler(req: Request) {
  // Block all write methods — subscription state is exclusively managed by the Stripe webhook.
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, 'Allow': 'GET' }
    });
  }

  let user;
  try {
    user = await getUserFromAuthHeader(req);
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: JSON_HEADERS });
  }
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  if (req.method === 'GET') {
    const table = 'subscriptions';
    try {
      const { data, error } = await supabaseServer
        .from(table)
        .select('plan,status,seats')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        // Table doesn't exist yet (42P01) — return free plan default
        if (error.code === '42P01' || error.message?.includes('relation "subscriptions" does not exist')) {
          return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200, headers: JSON_HEADERS });
        }
        // All other DB errors are server errors — do not silently return fabricated data
        console.error('[subscription] DB error:', error.message);
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: JSON_HEADERS });
      }

      if (!data) {
        return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200, headers: JSON_HEADERS });
      }
      return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
    } catch (e: any) {
      console.error('[subscription] Unexpected error:', e?.message);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: JSON_HEADERS });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...JSON_HEADERS, 'Allow': 'GET' }
  });
}
