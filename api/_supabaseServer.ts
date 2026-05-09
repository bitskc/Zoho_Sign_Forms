import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

// P3-05: Throw on misconfiguration rather than silently proceeding with empty strings.
// Vercel will log the error and return a 500 response, making the issue immediately visible.
if (!supabaseUrl || !supabaseServiceRole) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set. ' +
    'Check Vercel environment variable configuration.'
  );
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false }
});
