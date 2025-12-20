import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE!;

if (!supabaseUrl || !supabaseServiceRole) {
  console.warn('Supabase URL or SERVICE ROLE is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE.');
}

export const supabaseServer = createClient(supabaseUrl || '', supabaseServiceRole || '', {
  auth: { persistSession: false }
});
