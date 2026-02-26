import { supabaseServer } from './_supabaseServer.js';

export const config = { runtime: 'edge' };

// Stripe API base URL
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
 * Make an authenticated request to the Stripe REST API.
 * We use fetch directly because the Stripe Node SDK does not support Edge runtime.
 */
async function stripePost(path: string, params: Record<string, string>) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');

  const body = new URLSearchParams(params).toString();

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error as Record<string, unknown>) ?? {};
    throw new Error((err.message as string) || `Stripe error ${res.status}`);
  }
  return data;
}

/**
 * POST /api/stripe-checkout
 *
 * Creates a Stripe Checkout Session for the $60/year SignFlow Pro plan.
 * Returns { url } — the hosted checkout URL to redirect the user to.
 *
 * Required env vars (set in Vercel dashboard):
 *   STRIPE_SECRET_KEY — your Stripe secret key
 *   STRIPE_PRICE_ID   — the price ID for the $60/year plan
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'STRIPE_PRICE_ID is not configured' }), { status: 500 });
  }

  // Determine the app base URL from the request origin or env
  const origin = req.headers.get('origin') || process.env.APP_URL || 'https://www.signflow.ink';

  try {
    const session = await stripePost('/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      // Pre-fill email if we have it
      customer_email: user.email ?? '',
      // Pass user_id in metadata so we can match on webhook
      'metadata[user_id]': user.id,
      'subscription_data[metadata][user_id]': user.id,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
