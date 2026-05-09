-- Migration: Row-Level Security for user_credentials, form_analytics, subscriptions, form_qrcodes
-- P2-07 / MED-05,06,07 (Eng), CRIT-03 (Arch)
--
-- IMPORTANT: The Stripe webhook handler (api/stripe-webhook.ts) uses SUPABASE_SERVICE_ROLE_KEY
-- (via supabaseServer) which bypasses RLS. This is intentional — the subscriptions table has no
-- INSERT/UPDATE policy for the anon role; writes are exclusively via service role through the webhook.
-- If the webhook were to use the anon key, subscription writes would silently fail.

-- ---------------------------------------------------------------------------
-- user_credentials: only accessible by the owning user
-- ---------------------------------------------------------------------------
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own credentials" ON user_credentials
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- form_analytics: form owners read; anyone can insert for valid form_id
-- (prevents analytics spam against fabricated form IDs)
-- ---------------------------------------------------------------------------
ALTER TABLE form_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Form owners read analytics" ON form_analytics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM forms WHERE forms.id = form_analytics.form_id AND forms.user_id = auth.uid())
  );

CREATE POLICY "Insert analytics for existing forms" ON form_analytics
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM forms WHERE forms.id = form_analytics.form_id)
  );

-- ---------------------------------------------------------------------------
-- subscriptions: users may read their own row; writes are service-role only
-- (Stripe webhook bypasses RLS via service role — no INSERT/UPDATE policy needed here)
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription" ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- form_qrcodes: accessible only by the owning form's user
-- ---------------------------------------------------------------------------
ALTER TABLE form_qrcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own qr codes" ON form_qrcodes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM forms WHERE forms.id = form_qrcodes.form_id AND forms.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM forms WHERE forms.id = form_qrcodes.form_id AND forms.user_id = auth.uid())
  );
