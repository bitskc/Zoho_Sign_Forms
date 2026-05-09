-- Migration: Baseline user_credentials table definition (idempotent)
-- P2-07: CREATE TABLE IF NOT EXISTS ensures this is safe to re-apply.
-- The actual table may already exist; this migration documents the schema.

CREATE TABLE IF NOT EXISTS user_credentials (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   TEXT,
  client_secret TEXT,
  refresh_token TEXT,
  access_token  TEXT,
  api_domain  TEXT NOT NULL DEFAULT 'https://sign.zoho.com',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);
