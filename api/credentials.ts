import { supabaseServer } from './_supabaseServer.js';
import { createRequestLogger, sanitizeLogContext } from './utils/logger.js';
import {
  getRateLimitKey,
  checkRateLimit,
  createRateLimitResponse,
  RATE_LIMITS,
  cleanupRateLimitStore
} from './utils/rateLimiter.js';
import { getUserFromAuthHeader } from './utils/auth.js';
import { validateZohoDomain, DomainValidationError } from './utils/domainValidator.js';

export const config = { runtime: 'edge' };

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

/**
 * Returns a masked credential object safe to send to the frontend.
 * Secrets (clientSecret, refreshToken) are never returned — only boolean flags
 * indicating whether they have been set.
 */
function maskCredentials(row: {
  zoho_client_id: string | null;
  zoho_client_secret: string | null;
  zoho_refresh_token: string | null;
  api_domain: string | null;
}) {
  return {
    clientId: row.zoho_client_id,
    apiDomain: row.api_domain,
    hasClientSecret: Boolean(row.zoho_client_secret),
    hasRefreshToken: Boolean(row.zoho_refresh_token),
  };
}

export default async function handler(req: Request) {
  const { logger, logResponse, logError } = createRequestLogger(req);

  // Periodic cleanup of rate limit store
  if (Math.random() < 0.01) {
    cleanupRateLimitStore();
  }

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      logger.warn('Unauthorized access attempt');
      logResponse(401);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
    }

    logger.debug('User authenticated', { userId: user.id });

    // Apply rate limiting (per user)
    const rateKey = getRateLimitKey(req, user.id);
    const result = checkRateLimit(rateKey, RATE_LIMITS.CREDENTIALS);
    if (!result.allowed) {
      logger.warn('Rate limit exceeded for credentials', { retryAfter: result.retryAfter });
      logResponse(429);
      return createRateLimitResponse(result);
    }

    const table = 'user_credentials';

    if (req.method === 'GET') {
      logger.debug('Fetching stored credentials');
      const { data, error } = await supabaseServer
        .from(table)
        .select('zoho_client_id,zoho_client_secret,zoho_refresh_token,api_domain')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        logger.error('DB error fetching credentials', error);
        logResponse(500);
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: JSON_HEADERS });
      }
      if (!data) {
        logger.info('No credentials found');
        logResponse(404);
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });
      }
      logger.info('Credentials returned (masked)');
      logResponse(200);
      return new Response(JSON.stringify(maskCredentials(data)), { status: 200, headers: JSON_HEADERS });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body: any;
      try {
        body = await req.json();
      } catch {
        logResponse(400);
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
      }
      logger.debug('Updating credentials', sanitizeLogContext({ apiDomain: body.apiDomain }));

      // Fetch existing record so we can preserve secrets the caller chose not to update
      const { data: existing } = await supabaseServer
        .from(table)
        .select('zoho_client_secret,zoho_refresh_token')
        .eq('user_id', user.id)
        .maybeSingle();

      let cleanApiDomain = 'https://sign.zoho.com';
      try {
        cleanApiDomain = validateZohoDomain(body.apiDomain || 'https://sign.zoho.com');
      } catch (e) {
        if (e instanceof DomainValidationError) {
          logResponse(400);
          return new Response(JSON.stringify({ error: 'Invalid API domain' }), { status: 400, headers: JSON_HEADERS });
        }
        throw e;
      }

      const record = {
        user_id: user.id,
        zoho_client_id: body.clientId,
        // If clientSecret is absent/empty, preserve the stored value (never overwrite with blank)
        zoho_client_secret: body.clientSecret || existing?.zoho_client_secret || null,
        // Same for refreshToken
        zoho_refresh_token: body.refreshToken || existing?.zoho_refresh_token || null,
        api_domain: cleanApiDomain
      };

      const { data, error } = await supabaseServer
        .from(table)
        .upsert(record, { onConflict: 'user_id' })
        .select('zoho_client_id,zoho_client_secret,zoho_refresh_token,api_domain')
        .maybeSingle();
      if (error) {
        logger.error('DB error updating credentials', error);
        logResponse(500);
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: JSON_HEADERS });
      }
      logger.info('Credentials updated');
      logResponse(200);
      // Return masked shape — never return secrets in response
      return new Response(JSON.stringify(data ? maskCredentials(data) : { clientId: body.clientId, apiDomain: body.apiDomain, hasClientSecret: Boolean(record.zoho_client_secret), hasRefreshToken: Boolean(record.zoho_refresh_token) }), { status: 200, headers: JSON_HEADERS });
    }

    logger.warn('Method not allowed', { method: req.method });
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, 'Allow': 'GET, POST, PUT' }
    });
  } catch (err) {
    logError(err, 500);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: JSON_HEADERS });
  }
}
