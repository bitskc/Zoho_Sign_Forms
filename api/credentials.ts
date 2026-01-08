import { supabaseServer } from './_supabaseServer.js';
import { createRequestLogger, sanitizeLogContext } from './utils/logger.js';
import {
  getRateLimitKey,
  checkRateLimit,
  createRateLimitResponse,
  RATE_LIMITS,
  cleanupRateLimitStore
} from './utils/rateLimiter.js';

export const config = { runtime: 'edge' };

async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    logger.debug('User authenticated', { userId: user.id });

    // Apply rate limiting (per user)
    const rateKey = getRateLimitKey(req, user.id);
    const result = checkRateLimit(rateKey, RATE_LIMITS.CREDENTIALS);
    if (!result.allowed) {
      logger.warn('Rate limit exceeded for credentials', { retryAfter: result.retryAfter });
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
        logResponse(400);
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      }
      if (!data) {
        logger.info('No credentials found');
        logResponse(404);
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }
      logger.info('Credentials returned');
      logResponse(200);
      return new Response(JSON.stringify({
        clientId: data.zoho_client_id,
        clientSecret: data.zoho_client_secret,
        refreshToken: data.zoho_refresh_token,
        apiDomain: data.api_domain
      }), { status: 200 });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await req.json();
      logger.debug('Updating credentials', sanitizeLogContext({ apiDomain: body.apiDomain }));
      const record = {
        user_id: user.id,
        zoho_client_id: body.clientId,
        zoho_client_secret: body.clientSecret,
        zoho_refresh_token: body.refreshToken,
        api_domain: body.apiDomain || 'https://sign.zoho.com'
      };

      const { data, error } = await supabaseServer
        .from(table)
        .upsert(record, { onConflict: 'user_id' })
        .select()
        .maybeSingle();
      if (error) {
        logger.error('DB error updating credentials', error);
        logResponse(400);
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      }
      logger.info('Credentials updated');
      logResponse(200);
      return new Response(JSON.stringify({
        clientId: data?.zoho_client_id,
        clientSecret: data?.zoho_client_secret,
        refreshToken: data?.zoho_refresh_token,
        apiDomain: data?.api_domain
      }), { status: 200 });
    }

    logger.warn('Method not allowed', { method: req.method });
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  } catch (err) {
    logError(err, 500);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }), { status: 500 });
  }
}
