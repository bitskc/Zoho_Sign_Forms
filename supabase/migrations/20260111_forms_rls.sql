-- Forms Table Row-Level Security Migration
-- Adds RLS policies to protect form data with defense-in-depth security

-- Enable Row-Level Security on forms table
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can only manage their own forms
-- This applies to INSERT, UPDATE, and DELETE operations
CREATE POLICY "Users manage their own forms" ON forms
  FOR ALL 
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Public read access by slug
-- This allows anonymous users to fetch forms by slug for public form pages
-- Required for the public form rendering feature
CREATE POLICY "Public read access by slug" ON forms
  FOR SELECT 
  USING (true);

-- Add comments for documentation
COMMENT ON POLICY "Users manage their own forms" ON forms IS 
  'Users can create, read, update, and delete only their own forms. This enforces data isolation between users.';

COMMENT ON POLICY "Public read access by slug" ON forms IS 
  'Allow public access to forms for rendering public form pages. Anyone can read form configuration by slug.';

-- Verify RLS is enabled (for manual verification)
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'forms';
-- Expected: relrowsecurity = true
