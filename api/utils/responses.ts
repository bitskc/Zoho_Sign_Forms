/**
 * Shared HTTP response helpers and CORS utilities for all API handlers.
 *
 * Layer ownership:
 * - This file (application layer) owns CORS headers: Access-Control-Allow-*.
 * - vercel.json owns security headers: X-Frame-Options, HSTS, CSP, etc.
 *   vercel.json must NOT emit Access-Control-* headers to avoid duplicates.
 */

const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  'https://www.signflow.ink',
  'https://signflow.ink',
].filter(Boolean) as string[];

/**
 * Returns CORS headers for the given request origin.
 * Null/missing origin (server-to-server: Stripe webhook, Supabase triggers) gets no CORS headers.
 */
export function corsHeaders(origin?: string | null): HeadersInit {
  if (!origin) return {};
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Handles OPTIONS preflight requests. Returns null for non-OPTIONS methods.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  });
}

// ---------------------------------------------------------------------------
// Typed response helpers — consistent JSON shape + status codes
// ---------------------------------------------------------------------------

export const unauthorized = (msg = 'Unauthorized') =>
  new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

export const methodNotAllowed = (allowed: string) =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { Allow: allowed, 'Content-Type': 'application/json' },
  });

export const badRequest = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });

export const notFound = (msg = 'Not found') =>
  new Response(JSON.stringify({ error: msg }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

export const conflict = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });

export const internalError = (msg = 'Internal server error') =>
  new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
