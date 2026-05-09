-- Migration: Drop deprecated access_token column from forms table
-- P3-04 Phase B — apply ONLY after the code change (Phase A) has been deployed and verified.
--
-- Phase A (code): Removed access_token from api/forms.ts inserts and App.tsx saveForm.
-- Phase B (this file): Drops the column once no running code writes to it.
--
-- ⚠️ This migration is IRREVERSIBLE. Confirm old code is no longer deployed before running.

ALTER TABLE forms DROP COLUMN IF EXISTS access_token;
