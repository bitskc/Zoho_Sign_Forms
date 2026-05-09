import { supabaseServer } from '../_supabaseServer.js';

/**
 * Extracts and validates the Bearer token from the Authorization header.
 * Returns the authenticated Supabase user, or null if missing/invalid.
 *
 * Usage:
 *   const user = await getUserFromAuthHeader(req);
 *   if (!user) return new Response(..., { status: 401 });
 */
export async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
