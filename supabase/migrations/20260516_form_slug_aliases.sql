-- Preserve old public form URLs when a form slug changes.
-- This keeps printed QR codes and previously shared links working without
-- regenerating QR images.

CREATE TABLE IF NOT EXISTS form_slug_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  old_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_slug_aliases_form_id ON form_slug_aliases(form_id);
CREATE INDEX IF NOT EXISTS idx_form_slug_aliases_old_slug ON form_slug_aliases(old_slug);

ALTER TABLE form_slug_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own form slug aliases" ON form_slug_aliases;
CREATE POLICY "Users manage own form slug aliases" ON form_slug_aliases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_slug_aliases.form_id
      AND forms.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms
      WHERE forms.id = form_slug_aliases.form_id
      AND forms.user_id = auth.uid()
    )
  );
