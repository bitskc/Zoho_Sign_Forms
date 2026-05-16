import { timingSafeEqual } from 'node:crypto';
import { supabaseServer } from './_supabaseServer.js';
import { createRequestLogger } from './utils/logger.js';

// Node.js runtime required for node:crypto (timingSafeEqual) and raw body access.
// IMPORTANT: This handler uses SUPABASE_SERVICE_ROLE (via supabaseServer) which
// bypasses RLS — required for subscription writes since the subscriptions table has no
// INSERT/UPDATE policy for the anon role. See supabase/migrations/20260509_rls_tables.sql.
export const config = { runtime: 'nodejs' };

/**
 * Constant-time hex string comparison using Node.js crypto.timingSafeEqual.
 * Prevents timing attacks on the HMAC signature check.
 */
function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Verify a Stripe webhook signature using the Web Crypto API (Edge-compatible).
 * See: https://stripe.com/docs/webhooks/signatures
 */
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts: Record<string, string[]> = {};
  for (const part of sigHeader.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (!parts[k]) parts[k] = [];
    parts[k].push(v);
  }

  const timestamp = parts['t']?.[0];
  const v1Sigs = parts['v1'] ?? [];
  if (!timestamp || v1Sigs.length === 0) return false;

  // Reject webhooks older than the configured tolerance to prevent replay attacks.
  // Default is 5 minutes (300 seconds), following Stripe's recommendation. Override
  // via STRIPE_WEBHOOK_TOLERANCE_SECONDS for production tuning (e.g., 60–180s).
  const DEFAULT_TOLERANCE_SECONDS = 5 * 60;
  const toleranceEnv = typeof process !== 'undefined' ? process.env?.STRIPE_WEBHOOK_TOLERANCE_SECONDS : undefined;
  const parsedTolerance = toleranceEnv ? parseInt(toleranceEnv, 10) : NaN;
  const tolerance = Number.isFinite(parsedTolerance) && parsedTolerance > 0
    ? parsedTolerance
    : DEFAULT_TOLERANCE_SECONDS;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > tolerance) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Use constant-time comparison to prevent timing attacks on the HMAC signature.
  return v1Sigs.some((sig) => safeCompare(sig, computedHex));
}

/**
 * POST /api/stripe-webhook
 *
 * Handles Stripe webhook events and keeps the `subscriptions` table in sync.
 *
 * Handled events:
 *   - checkout.session.completed         → subscription created/activated
 *   - customer.subscription.updated      → plan/status change
 *   - customer.subscription.deleted      → subscription cancelled
 *
 * Required env var:
 *   STRIPE_WEBHOOK_SECRET — from Stripe Dashboard → Webhooks → Signing secret
 * Optional:
 *   STRIPE_WEBHOOK_TOLERANCE_SECONDS — replay attack tolerance (default 300)
 */
export default async function handler(req: Request) {
  const { logger, logResponse } = createRequestLogger(req);

  if (req.method !== 'POST') {
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not configured');
    logResponse(500);
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500, headers: JSON_HEADERS });
  }

  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) {
    logResponse(400);
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), { status: 400, headers: JSON_HEADERS });
  }

  const rawBody = await req.text();
  const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!isValid) {
    logger.warn('Invalid Stripe webhook signature');
    logResponse(400);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: JSON_HEADERS });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logResponse(400);
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const eventType = event.type as string;
  const eventObject = event.data
    ? (event.data as Record<string, unknown>).object as Record<string, unknown>
    : {};

  logger.info('Processing Stripe webhook', { eventType });

  try {
    switch (eventType) {
      case 'checkout.session.completed': {
        const customerId = eventObject.customer as string;
        const subscriptionId = eventObject.subscription as string;
        const metadata = (eventObject.metadata as Record<string, string>) ?? {};
        const userId = metadata.user_id;

        if (!userId) {
          // Log all available identifiers for manual reconciliation
          logger.warn('checkout.session.completed: no user_id in metadata — requires manual reconciliation', {
            customerId,
            subscriptionId,
          });
          break;
        }

        const { error: upsertErr } = await supabaseServer
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              plan: 'pro',
              status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
            },
            { onConflict: 'user_id' }
          );

        if (upsertErr) {
          logger.error('Failed to upsert subscription on checkout.session.completed', {
            userId,
            customerId,
            subscriptionId,
            errorMessage: upsertErr.message,
          });
          // Return 500 so Stripe retries on transient DB errors
          return new Response(
            JSON.stringify({ received: false, error: upsertErr.message }),
            { status: 500, headers: JSON_HEADERS }
          );
        }

        logger.info('Subscription activated', { userId, customerId });
        break;
      }

      case 'customer.subscription.updated': {
        const subscriptionId = eventObject.id as string;
        const customerId = eventObject.customer as string;
        const status = eventObject.status as string;
        const currentPeriodEnd = eventObject.current_period_end as number | undefined;
        const metadata = (eventObject.metadata as Record<string, string>) ?? {};
        const userId = metadata.user_id;

        // Map all Stripe subscription statuses to local plan/status
        let mappedStatus: string;
        let mappedPlan: string;

        if (status === 'active' || status === 'trialing') {
          mappedStatus = 'active';
          mappedPlan = 'pro';
        } else if (status === 'past_due') {
          // Still on pro, but needs attention
          mappedStatus = 'past_due';
          mappedPlan = 'pro';
        } else if (status === 'incomplete' || status === 'incomplete_expired' || status === 'unpaid') {
          // Subscription not in good standing — downgrade to free
          mappedStatus = status;
          mappedPlan = 'free';
        } else if (status === 'paused') {
          // Paused — keep on pro but mark distinctly
          mappedStatus = 'paused';
          mappedPlan = 'pro';
        } else {
          // cancelled or unknown terminal status
          mappedStatus = 'cancelled';
          mappedPlan = 'free';
        }

        const updatePayload: Record<string, unknown> = {
          plan: mappedPlan,
          status: mappedStatus,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        };

        if (currentPeriodEnd) {
          updatePayload.current_period_end = new Date(currentPeriodEnd * 1000).toISOString();
        }

        const query = userId
          ? supabaseServer.from('subscriptions').update(updatePayload).eq('user_id', userId)
          : supabaseServer.from('subscriptions').update(updatePayload).eq('stripe_customer_id', customerId);

        const { error: updateErr } = await query;
        if (updateErr) {
          logger.error('Failed to update subscription on subscription.updated', {
            userId,
            customerId,
            subscriptionId,
            status,
            errorMessage: updateErr.message,
          });
          return new Response(
            JSON.stringify({ received: false, error: updateErr.message }),
            { status: 500, headers: JSON_HEADERS }
          );
        }

        logger.info('Subscription updated', { userId, customerId, mappedStatus, mappedPlan });
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = eventObject.customer as string;
        const subscriptionId = eventObject.id as string;
        const metadata = (eventObject.metadata as Record<string, string>) ?? {};
        const userId = metadata.user_id;

        const updatePayload = {
          plan: 'free',
          status: 'cancelled',
          stripe_subscription_id: subscriptionId,
        };

        const query = userId
          ? supabaseServer.from('subscriptions').update(updatePayload).eq('user_id', userId)
          : supabaseServer.from('subscriptions').update(updatePayload).eq('stripe_customer_id', customerId);

        const { error: deleteErr } = await query;
        if (deleteErr) {
          logger.error('Failed to update subscription on subscription.deleted', {
            userId,
            customerId,
            errorMessage: deleteErr.message,
          });
          return new Response(
            JSON.stringify({ received: false, error: deleteErr.message }),
            { status: 500, headers: JSON_HEADERS }
          );
        }

        logger.info('Subscription cancelled', { userId, customerId });
        break;
      }

      default:
        logger.info(`Unhandled Stripe event type: ${eventType}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Error handling Stripe event ${eventType}`, err instanceof Error ? err : new Error(message));
    // Return 500 for unexpected errors so Stripe will retry
    return new Response(
      JSON.stringify({ received: false, error: message }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  logResponse(200, { eventType });
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: JSON_HEADERS });
}
