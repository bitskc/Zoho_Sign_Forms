import { supabaseServer } from './_supabaseServer.js';

export const config = { runtime: 'edge' };

/**
 * Verify a Stripe webhook signature using the Web Crypto API (Edge-compatible).
 *
 * Stripe signs webhooks using HMAC-SHA256 with a timestamp-prefixed payload.
 * See: https://stripe.com/docs/webhooks/signatures
 */
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  // Parse the Stripe-Signature header  e.g. "t=1614...,v1=abc...,v0=..."
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

  // Reject webhooks older than 5 minutes to prevent replay attacks
  const tolerance = 5 * 60; // seconds
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

  return v1Sigs.some((sig) => sig === computedHex);
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
 * Required env var (set in Vercel dashboard):
 *   STRIPE_WEBHOOK_SECRET — from `stripe listen` or Stripe Dashboard webhook settings
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500 });
  }

  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), { status: 400 });
  }

  const rawBody = await req.text();

  const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const eventType = event.type as string;
  const eventObject = event.data ? (event.data as Record<string, unknown>).object as Record<string, unknown> : {};

  try {
    switch (eventType) {
      case 'checkout.session.completed': {
        // checkout.session has customer, subscription, metadata
        const customerId = eventObject.customer as string;
        const subscriptionId = eventObject.subscription as string;
        const metadata = (eventObject.metadata as Record<string, string>) ?? {};
        const userId = metadata.user_id;

        if (!userId) {
          console.warn('checkout.session.completed: no user_id in metadata', { customerId });
          break;
        }

        await supabaseServer
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
        break;
      }

      case 'customer.subscription.updated': {
        // subscription object has id, customer, status, current_period_end, metadata
        const subscriptionId = eventObject.id as string;
        const customerId = eventObject.customer as string;
        const status = eventObject.status as string;
        const currentPeriodEnd = eventObject.current_period_end as number | undefined;
        const metadata = (eventObject.metadata as Record<string, string>) ?? {};
        const userId = metadata.user_id;

        // Map Stripe statuses to our plan/status model
        const isActive = status === 'active' || status === 'trialing';
        const mappedStatus = isActive ? 'active' : status === 'past_due' ? 'past_due' : 'cancelled';
        const mappedPlan = isActive ? 'pro' : 'free';

        const updatePayload: Record<string, unknown> = {
          plan: mappedPlan,
          status: mappedStatus,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        };

        if (currentPeriodEnd) {
          updatePayload.current_period_end = new Date(currentPeriodEnd * 1000).toISOString();
        }

        if (userId) {
          // Update by user_id if we have it
          await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('user_id', userId);
        } else {
          // Fall back to matching by stripe_customer_id
          await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('stripe_customer_id', customerId);
        }
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

        if (userId) {
          await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('user_id', userId);
        } else {
          await supabaseServer
            .from('subscriptions')
            .update(updatePayload)
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      default:
        // Acknowledge unknown events without doing anything
        console.log(`Unhandled Stripe event: ${eventType}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error handling Stripe event ${eventType}:`, message);
    // Still return 200 to prevent Stripe from retrying for transient DB errors
    return new Response(JSON.stringify({ received: true, warning: message }), { status: 200 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
