import { supabaseServer } from './_supabaseServer.js';
import { createRequestLogger } from './utils/logger.js';
import {
  getRateLimitKey,
  checkRateLimit,
  createRateLimitResponse,
  RATE_LIMITS,
} from './utils/rateLimiter.js';

export const config = { runtime: 'edge' };

const STRIPE_API = 'https://api.stripe.com/v1';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

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
 * their subscription (cancel, update payment method, view invoices).
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 */
export default async function handler(req: Request) {
  const { logger, logResponse } = createRequestLogger(req);

  if (req.method !== 'POST') {
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  // Rate limiting
  const rateLimitKey = getRateLimitKey(req);
  const rateLimitCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.CREDENTIALS);
  if (!rateLimitCheck.allowed) {
    logger.warn('Rate limit exceeded', { limitKey: rateLimitKey });
    logResponse(429);
    return createRateLimitResponse(rateLimitCheck);
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    logResponse(401);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    logger.error('STRIPE_SECRET_KEY is not configured');
    logResponse(500);
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured' }), { status: 500, headers: JSON_HEADERS });
  }

  // Look up stripe_customer_id — differentiate DB errors from missing subscriptions
  const { data: sub, error: subErr } = await supabaseServer
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subErr) {
    logger.error('Failed to retrieve subscription for portal', new Error(subErr.message), { userId: user.id });
    logResponse(500);
    return new Response(JSON.stringify({ error: 'Failed to retrieve subscription' }), { status: 500, headers: JSON_HEADERS });
  }

  if (!sub?.stripe_customer_id) {
    logResponse(404);
    return new Response(JSON.stringify({ error: 'No active Stripe subscription found' }), { status: 404, headers: JSON_HEADERS });
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

    logger.info('Stripe billing portal session created', { userId: user.id });
    logResponse(200, { userId: user.id });
    return new Response(JSON.stringify({ url: data.url }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Stripe billing portal session failed', err instanceof Error ? err : new Error(message));
    logResponse(500);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: JSON_HEADERS });
  }
}
