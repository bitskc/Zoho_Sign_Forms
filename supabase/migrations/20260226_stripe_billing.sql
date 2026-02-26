-- Add Stripe billing columns to subscriptions table.
--
-- These columns are populated by the Stripe webhook handler (/api/stripe-webhook.ts)
-- when billing events are received. Existing rows will have NULL values for all
-- three columns until a user upgrades to a paid plan — this is expected behavior.
-- Non-Stripe subscriptions (e.g., manually provisioned) will remain NULL indefinitely.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Partial index for fast webhook lookups by Stripe customer ID.
-- Partial (WHERE NOT NULL) keeps the index small since most rows start NULL.
-- For finding NULL rows (not yet linked to Stripe), use a sequential scan — 
-- these are infrequent admin queries and don't require index optimization.
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Partial index for webhook lookups by subscription ID.
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
  ON subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
