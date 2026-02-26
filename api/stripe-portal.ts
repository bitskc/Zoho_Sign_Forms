import { supabaseServer } from './_supabaseServer.js';

export const config = { runtime: 'edge' };

const STRIPE_API = 'https://api.stripe.com/v1';

async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * POST /api/stripe-portal
 *
 * Creates a Stripe Billing Portal session so the user can manage
 * their subscription (upgrade, cancel, update payment method).
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured' }), { status: 500 });
  }

  // Look up the customer's Stripe customer ID
  const { data: sub, error: subErr } = await supabaseServer
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subErr || !sub?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: 'No active subscription found' }), { status: 404 });
  }

  const origin = req.headers.get('origin') || process.env.APP_URL || 'https://www.signflow.ink';

  try {
    const params = new URLSearchParams({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });

    const res = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      const err = (data.error as Record<string, unknown>) ?? {};
      throw new Error((err.message as string) || `Stripe error ${res.status}`);
    }

    return new Response(JSON.stringify({ url: data.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
