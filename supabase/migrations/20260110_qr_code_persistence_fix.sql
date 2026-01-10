-- QR Code Persistence Fix Migration
-- This migration ensures QR code tables exist and adds proper indexes

-- 1. Create form_qrcodes table (if not exists - safe to run multiple times)
CREATE TABLE IF NOT EXISTS form_qrcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  qr_code_data TEXT NOT NULL, -- URL to QR code image (e.g., https://api.qrserver.com/...)
  stable_id TEXT UNIQUE NOT NULL, -- Permanent identifier (e.g., 'qr-abc123')
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add indexes for performance (IF NOT EXISTS to avoid errors on re-run)
CREATE INDEX IF NOT EXISTS idx_form_qrcodes_form_id ON form_qrcodes(form_id);
CREATE INDEX IF NOT EXISTS idx_form_qrcodes_stable_id ON form_qrcodes(stable_id);

-- 3. Add qr_stable_id column to forms table (if not exists)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS qr_stable_id TEXT;
CREATE INDEX IF NOT EXISTS idx_forms_qr_stable_id ON forms(qr_stable_id);

-- 4. Create unique constraint on form_id for QR codes (one QR per form)
DO $$ 
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'form_qrcodes_form_id_unique' 
    AND table_name = 'form_qrcodes'
  ) THEN
    ALTER TABLE form_qrcodes ADD CONSTRAINT form_qrcodes_form_id_unique UNIQUE (form_id);
  END IF;
END $$;

-- 5. Function to automatically update updated_at timestamp (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. Create trigger for form_qrcodes updated_at (drop and recreate for safety)
DROP TRIGGER IF EXISTS update_form_qrcodes_updated_at ON form_qrcodes;
CREATE TRIGGER update_form_qrcodes_updated_at
  BEFORE UPDATE ON form_qrcodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Add RLS (Row Level Security) policies for form_qrcodes
ALTER TABLE form_qrcodes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can manage their own form QR codes" ON form_qrcodes;
CREATE POLICY "Users can manage their own form QR codes" ON form_qrcodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM forms 
      WHERE forms.id = form_qrcodes.form_id 
      AND forms.user_id = auth.uid()
    )
  );

-- Drop existing policy if it exists, then create new one
DROP POLICY IF EXISTS "Public read access for QR codes" ON form_qrcodes;
CREATE POLICY "Public read access for QR codes" ON form_qrcodes
  FOR SELECT USING (true);