import { supabaseServer } from './_supabaseServer.js';
import { getUserFromAuthHeader } from './utils/auth.js';

// Subscription writes are intentionally restricted to the Stripe webhook handler only.
// POST and PUT are disabled here to prevent self-upgrade exploits.
// See api/stripe-webhook.ts for the authoritative subscription write path.
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  // Block all write methods — subscription state is exclusively managed by the Stripe webhook.
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Allow': 'GET', 'Content-Type': 'application/json' }
    });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
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
          return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200 });
        }
        // All other DB errors are server errors — do not silently return fabricated data
        console.error('[subscription] DB error:', error.message);
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
      }

      if (!data) {
        return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify(data), { status: 200 });
    } catch (e: any) {
      console.error('[subscription] Unexpected error:', e?.message);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Allow': 'GET', 'Content-Type': 'application/json' }
  });
}
