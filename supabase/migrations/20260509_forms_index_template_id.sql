-- P1-01 / P1-02: Add index on forms(template_id) to support efficient server-side
-- form owner lookup (templateId → user_id) for the SSRF/auth-bypass fixes.
-- Without this index, every unauthenticated sign request scans the full forms table.
CREATE INDEX IF NOT EXISTS idx_forms_template_id ON forms(template_id);
