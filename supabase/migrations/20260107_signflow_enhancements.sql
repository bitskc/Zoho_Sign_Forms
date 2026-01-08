-- SignFlow Pro Enhancement Migration
-- This migration adds QR codes and analytics functionality

-- 1. Create form_qrcodes table
CREATE TABLE IF NOT EXISTS form_qrcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  qr_code_data TEXT NOT NULL, -- Base64 encoded QR code image
  stable_id TEXT UNIQUE NOT NULL, -- Permanent identifier (e.g., 'qr-abc123')
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_qrcodes_form_id ON form_qrcodes(form_id);
CREATE INDEX IF NOT EXISTS idx_form_qrcodes_stable_id ON form_qrcodes(stable_id);

-- 2. Create form_analytics table
CREATE TABLE IF NOT EXISTS form_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'visit', 'submit_start', 'submit_success', 'submit_error'
  visitor_email TEXT, -- Captured on submit attempts
  visitor_name TEXT, -- Captured on submit attempts
  referrer TEXT,
  user_agent TEXT,
  metadata JSONB, -- Flexible field for additional non-sensitive data (no IP address storage, GDPR compliant)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_analytics_form_id ON form_analytics(form_id);
CREATE INDEX IF NOT EXISTS idx_form_analytics_event_type ON form_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_form_analytics_created_at ON form_analytics(created_at DESC);

-- 3. Update forms table to add qr_stable_id column
ALTER TABLE forms ADD COLUMN IF NOT EXISTS qr_stable_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_forms_qr_stable_id ON forms(qr_stable_id);

-- 4. Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Create trigger for form_qrcodes updated_at
DROP TRIGGER IF EXISTS update_form_qrcodes_updated_at ON form_qrcodes;
CREATE TRIGGER update_form_qrcodes_updated_at
  BEFORE UPDATE ON form_qrcodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
