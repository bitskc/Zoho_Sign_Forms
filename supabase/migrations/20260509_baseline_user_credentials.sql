-- Migration: Baseline user_credentials table definition (idempotent)
-- P2-07: CREATE TABLE IF NOT EXISTS ensures this is safe to re-apply.
-- The actual table may already exist; this migration documents the schema.

CREATE TABLE IF NOT EXISTS user_credentials (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zoho_client_id    TEXT,
  zoho_client_secret TEXT,
  zoho_refresh_token TEXT,
  -- access_token intentionally omitted (P3-04): credentials API no longer stores it
  api_domain        TEXT NOT NULL DEFAULT 'https://sign.zoho.com',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);
