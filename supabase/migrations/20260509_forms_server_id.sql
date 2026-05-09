-- Migration: Server-generate form IDs
-- P2-03: Client-supplied UUIDs are no longer accepted for new forms.
-- The DB generates the id via gen_random_uuid() so the server can return
-- the canonical id to the client after insert.
--
-- This migration is safe for existing rows (they already have ids).
-- Apply BEFORE deploying the code change that omits id from INSERT.

ALTER TABLE forms ALTER COLUMN id SET DEFAULT gen_random_uuid();
