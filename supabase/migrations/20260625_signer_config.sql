-- Add signer/delivery configuration column to forms table.
-- Allows admins to override who fills each non-public role of a Zoho Sign
-- template (additional signers and "receives a copy" / VIEW recipients) and
-- whether each role is delivered via embedded signing or email.
--
-- The public signer's role continues to be collected from the public form at
-- submit time and is not stored here.
--
-- Shape (camelCase keys are normalized to snake_case by the API layer):
-- {
--   "notes": "Optional override for the Zoho request notes",
--   "roles": [
--     {
--       "role": "Approver",
--       "action_type": "APPROVER",
--       "recipient_name": "Jane Reviewer",
--       "recipient_email": "jane@example.com",
--       "delivery_mode": "email",        // "embedded" | "email"
--       "is_public": false               // true for the role filled by the public submitter
--     }
--   ]
-- }
ALTER TABLE forms ADD COLUMN IF NOT EXISTS signer_config JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_forms_signer_config ON forms USING GIN (signer_config);

COMMENT ON COLUMN forms.signer_config IS 'JSON configuration overriding template roles (additional signers / copy recipients) and delivery mode per role. Public signer role is excluded.';
