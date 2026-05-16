import { supabaseServer } from './_supabaseServer.js';
import { createRequestLogger } from './utils/logger.js';
import {
  getRateLimitKey,
  checkRateLimit,
  createRateLimitResponse,
  RATE_LIMITS,
} from './utils/rateLimiter.js';
import { getUserFromAuthHeader } from './utils/auth.js';

export const config = { runtime: 'edge' };

const STRIPE_API = 'https://api.stripe.com/v1';

/**
 * Make an authenticated POST request to the Stripe REST API.
 * Uses fetch directly — the Stripe Node SDK is not Edge-runtime compatible.
 *
 * Accepts string, number, or boolean values; all are coerced to strings for
 * the application/x-www-form-urlencoded body.
 */
async function stripePost(path: string, params: Record<string, string | number | boolean>) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');

  const stringParams: Record<string, string> = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );

  const body = new URLSearchParams(stringParams).toString();

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

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

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
  const { logger, logResponse } = createRequestLogger(req);

  if (req.method !== 'POST') {
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  // Rate limiting — same window as credentials endpoint
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

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    logger.error('STRIPE_PRICE_ID is not configured');
    logResponse(500);
    return new Response(JSON.stringify({ error: 'STRIPE_PRICE_ID is not configured' }), { status: 500, headers: JSON_HEADERS });
  }

  // P2-05: Never construct redirect URLs from the Origin header — it is user-controlled.
  // Use APP_URL env var (set in Vercel dashboard); fall back to the hardcoded production URL.
  const appUrl = process.env.APP_URL || 'https://www.signflow.ink';

  try {
    const params: Record<string, string | number | boolean> = {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': 1,
      'metadata[user_id]': user.id,
      'subscription_data[metadata][user_id]': user.id,
      success_url: `${appUrl}/#/admin/dashboard?checkout=success`,
      cancel_url: `${appUrl}/#/admin/dashboard?checkout=cancelled`,
    };

    // Pre-fill email only when a valid value is present
    if (user.email && user.email.trim() !== '') {
      params.customer_email = user.email;
    }

    logger.info('Creating Stripe checkout session', { userId: user.id });
    const session = await stripePost('/checkout/sessions', params);

    logResponse(200, { userId: user.id });
    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Stripe checkout session creation failed', err instanceof Error ? err : new Error(message));
    logResponse(500);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session. Please try again.' }), { status: 500, headers: JSON_HEADERS });
  }
}
