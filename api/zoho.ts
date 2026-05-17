import { supabaseServer } from './_supabaseServer.js';
import { createRequestLogger, sanitizeLogContext } from './utils/logger.js';
import {
  getRateLimitKey,
  checkRateLimit,
  createRateLimitResponse,
  RATE_LIMITS,
  cleanupRateLimitStore
} from './utils/rateLimiter.js';
import { validateZohoDomain, DomainValidationError } from './utils/domainValidator.js';
import { isMissingSlugAliasTableError } from './utils/slugAlias.js';

export const config = {
  runtime: 'edge',
};

async function slugBelongsToForm(formId: string, slug: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from('form_slug_aliases')
    .select('form_id')
    .eq('old_slug', slug)
    .maybeSingle();

  if (error && isMissingSlugAliasTableError(error)) return false;
  if (error) throw error;
  return data?.form_id === formId;
}

const JSON_NO_STORE_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

const OAUTH_TIMEOUT_MS = 10_000;
const ZOHO_API_TIMEOUT_MS = 15_000;

function jsonResponse(status: number, payload: Record<string, unknown>, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...JSON_NO_STORE_HEADERS,
      ...(headers || {}),
    },
  });
}

/**
 * Maps a validated Zoho Sign hostname to its corresponding Zoho Accounts OAuth URL.
 */
function getAccountsUrl(apiDomain: string) {
  if (apiDomain.includes('.eu')) return 'https://accounts.zoho.eu';
  if (apiDomain.includes('.in')) return 'https://accounts.zoho.in';
  if (apiDomain.includes('.com.au')) return 'https://accounts.zoho.com.au';
  if (apiDomain.includes('.jp')) return 'https://accounts.zoho.jp';
  return 'https://accounts.zoho.com';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getOAuthToken(params: URLSearchParams, apiDomain: string) {
  const accountsUrl = `${getAccountsUrl(apiDomain)}/oauth/v2/token`;

  const response = await fetchWithTimeout(accountsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: params,
  }, OAUTH_TIMEOUT_MS);

  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok || (data as any).error) {
    const message = (data as any).error_description || (data as any).error || 'OAuth Request Failed';
    throw new Error(String(message));
  }
  return data as Record<string, unknown>;
}

export default async function handler(req: Request) {
  const { logger, logResponse } = createRequestLogger(req);

  if (Math.random() < 0.01) {
    cleanupRateLimitStore();
  }

  if (req.method !== 'POST') {
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        ...JSON_NO_STORE_HEADERS,
        'Allow': 'POST',
      },
    });
  }

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      logResponse(400);
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const { action, apiDomain, clientId, clientSecret, refreshToken, grantToken, redirectUri } = body;

    logger.debug('Request body received', sanitizeLogContext({
      action,
      apiDomain,
      clientId: clientId ? '[PROVIDED]' : '[ENV]',
      clientSecret: clientSecret ? '[PROVIDED]' : '[ENV]',
      formId: body.formId,
      slug: body.slug,
      templateId: body.templateId?.slice?.(0, 8),
    }));

    const { formId, slug, templateId, signer, roleName, isTest, accessToken: providedAccessToken,
      clientId: providedClientId, clientSecret: providedClientSecret } = body;

    const routeLimitId = action === 'exchange'
      ? 'exchange'
      : (formId || slug || templateId || 'unknown');
    const rateLimitKey = `${getRateLimitKey(req)}:zoho:${routeLimitId}`;
    const rateLimitCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.ZOHO_API);

    if (!rateLimitCheck.allowed) {
      logger.warn('Rate limit exceeded', {
        limitKey: rateLimitKey,
        retryAfter: rateLimitCheck.retryAfter,
      });
      logResponse(429);
      return createRateLimitResponse(rateLimitCheck);
    }

    const resolvedClientId = clientId || process.env.ZOHO_CLIENT_ID;
    const resolvedClientSecret = clientSecret || process.env.ZOHO_CLIENT_SECRET;

    // --- CASE 1: Initial OAuth Exchange (Grant Token -> Refresh Token) ---
    if (action === 'exchange') {
      logger.info('Processing OAuth token exchange');

      let cleanExchangeDomain: string;
      try {
        cleanExchangeDomain = validateZohoDomain(apiDomain || 'sign.zoho.com');
      } catch (e) {
        if (e instanceof DomainValidationError) {
          logResponse(400);
          return jsonResponse(400, { error: 'Invalid API domain' });
        }
        throw e;
      }

      if (!grantToken || !resolvedClientId || !resolvedClientSecret) {
        logResponse(400);
        return jsonResponse(400, {
          error: 'Missing data',
          message: 'grantToken, clientId, and clientSecret are required for exchange.',
        });
      }

      const params = new URLSearchParams();
      params.append('code', grantToken);
      params.append('client_id', resolvedClientId);
      params.append('client_secret', resolvedClientSecret);
      params.append('redirect_uri', redirectUri || 'https://api-console.zoho.com');
      params.append('grant_type', 'authorization_code');

      try {
        const data = await getOAuthToken(params, cleanExchangeDomain);
        logger.info('OAuth token exchange successful');
        logResponse(200, { action: 'exchange' });
        return jsonResponse(200, data as Record<string, unknown>);
      } catch (e: any) {
        logger.error('OAuth token exchange failed', e);
        logResponse(400, { action: 'exchange' });
        return jsonResponse(400, { error: e.message });
      }
    }

    // --- CASE 2: Standard Sign Request ---
    const authHeader = req.headers.get('Authorization');
    let authedUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const { data: authData, error: authErr } = await supabaseServer.auth.getUser(token);
      if (!authErr && authData.user) {
        authedUserId = authData.user.id;
      }
    }

    if (!formId && !slug && !templateId) {
      logResponse(400);
      return jsonResponse(400, {
        error: 'Missing data',
        message: authedUserId
          ? 'One of formId, slug, or templateId is required.'
          : 'Public signing requests require formId and slug.',
      });
    }

    if (!authedUserId && (!formId || !slug)) {
      logResponse(400);
      return jsonResponse(400, {
        error: 'Missing form identity',
        message: 'Public signing requests require formId and slug.',
      });
    }

    // Resolve form/owner from formId or slug. Authenticated test calls may use templateId for compatibility.
    let formRow: { id: string; user_id: string; slug: string; template_id: string; role_name: string; api_domain: string | null } | null = null;

    if (formId) {
      const { data, error } = await supabaseServer
        .from('forms')
        .select('id,user_id,slug,template_id,role_name,api_domain')
        .eq('id', formId)
        .maybeSingle();
      if (!error && data) {
        formRow = data;
      }
    } else if (slug) {
      const { data, error } = await supabaseServer
        .from('forms')
        .select('id,user_id,slug,template_id,role_name,api_domain')
        .eq('slug', slug)
        .maybeSingle();
      if (!error && data) {
        formRow = data;
      }
    } else if (templateId && authedUserId) {
      const { data, error } = await supabaseServer
        .from('forms')
        .select('id,user_id,slug,template_id,role_name,api_domain')
        .eq('template_id', templateId)
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        formRow = data;
      }
    }

    if (!formRow) {
      logger.warn('Form not found for sign request', {
        formId,
        slug,
        templateId: templateId?.slice?.(0, 8),
      });
      logResponse(404);
      return jsonResponse(404, { error: 'Form not found' });
    }

    if (authedUserId && authedUserId !== formRow.user_id) {
      logResponse(403);
      return jsonResponse(403, { error: 'Forbidden' });
    }

    if (formId && slug && formRow.slug !== slug) {
      if (!(await slugBelongsToForm(formRow.id, slug))) {
        logResponse(404);
        return jsonResponse(404, { error: 'Form not found' });
      }
    }

    const allowClientOverrides = Boolean(authedUserId && authedUserId === formRow.user_id);
    const isPublicSubmit = !allowClientOverrides;
    const cleanTemplateId = ((allowClientOverrides ? templateId : undefined) || formRow.template_id || '').trim();
    const cleanRoleName = ((allowClientOverrides ? roleName : undefined) || formRow.role_name || 'Signer 1').trim();

    if (!cleanTemplateId || !signer?.name || !signer?.email) {
      logResponse(400);
      return jsonResponse(400, {
        error: 'Missing data',
        message: 'signer.name, signer.email, and server-side form template configuration are required.',
      });
    }

    let cleanDomain = 'https://sign.zoho.com';
    try {
      if (allowClientOverrides && apiDomain) {
        cleanDomain = validateZohoDomain(String(apiDomain).replace(/\/+$/, '').trim());
      } else if (formRow.api_domain) {
        cleanDomain = validateZohoDomain(String(formRow.api_domain).replace(/\/+$/, '').trim());
      }
    } catch (e) {
      if (e instanceof DomainValidationError) {
        logResponse(400);
        return jsonResponse(400, { error: 'Invalid API domain' });
      }
      throw e;
    }

    let effectiveClientId = allowClientOverrides ? (providedClientId || resolvedClientId) : undefined;
    let effectiveClientSecret = allowClientOverrides ? (providedClientSecret || resolvedClientSecret) : undefined;
    let effectiveRefreshToken = allowClientOverrides ? refreshToken : undefined;

    if (!effectiveClientId || !effectiveClientSecret || !effectiveRefreshToken) {
      const { data: credRow, error: credErr } = await supabaseServer
        .from('user_credentials')
        .select('zoho_client_id,zoho_client_secret,zoho_refresh_token,api_domain')
        .eq('user_id', formRow.user_id)
        .maybeSingle();

      if (!credErr && credRow) {
        effectiveClientId = effectiveClientId || credRow.zoho_client_id;
        effectiveClientSecret = effectiveClientSecret || credRow.zoho_client_secret;
        effectiveRefreshToken = effectiveRefreshToken || credRow.zoho_refresh_token;
        if (!(allowClientOverrides && apiDomain) && !formRow.api_domain && credRow.api_domain) {
          try {
            cleanDomain = validateZohoDomain(credRow.api_domain);
          } catch {
            // keep previous validated domain
          }
        }
      }
    }

    const clientProvidedAccessToken = allowClientOverrides ? providedAccessToken : undefined;
    if (!clientProvidedAccessToken && (!effectiveClientId || !effectiveClientSecret || !effectiveRefreshToken)) {
      logResponse(400);
      return jsonResponse(400, isPublicSubmit ? {
        error: 'Signing unavailable',
        message: 'We could not prepare this document. Please try again or contact the sender.',
      } : {
        error: 'Missing credentials',
        message: 'Server-side Zoho credentials are missing for this form owner.',
      });
    }

    let accessToken: string | undefined = clientProvidedAccessToken;
    if (!accessToken) {
      const refreshParams = new URLSearchParams();
      refreshParams.append('refresh_token', effectiveRefreshToken);
      refreshParams.append('client_id', effectiveClientId || '');
      refreshParams.append('client_secret', effectiveClientSecret || '');
      refreshParams.append('grant_type', 'refresh_token');

      try {
        const authData = await getOAuthToken(refreshParams, cleanDomain);
        accessToken = String(authData.access_token || '');
      } catch {
        logResponse(401);
        return jsonResponse(401, isPublicSubmit ? {
          error: 'Signing unavailable',
          message: 'We could not prepare this document. Please try again or contact the sender.',
        } : {
          error: 'Authentication Failure',
          message: 'OAuth token refresh failed. Check your server-side Zoho credentials.',
        });
      }
    }

    const templateInfo = await fetchWithTimeout(`${cleanDomain}/api/v1/templates/${cleanTemplateId}`, {
      method: 'GET',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
    }, ZOHO_API_TIMEOUT_MS);

    if (!templateInfo.ok) {
      logResponse(400, { stage: 'template_lookup', zohoStatus: templateInfo.status });
      return jsonResponse(400, isPublicSubmit ? {
        error: 'Signing unavailable',
        message: 'We could not prepare this document. Please try again or contact the sender.',
      } : {
        error: 'Template fetch failed',
        message: `Zoho template lookup failed with status ${templateInfo.status}`,
      });
    }

    const templateData = await templateInfo.json().catch(() => ({}));
    const actions = (templateData as any)?.templates?.actions || [];
    const matchedAction = actions.find((a: any) => (a.role || '').trim().toLowerCase() === cleanRoleName.toLowerCase());
    if (!matchedAction?.action_id) {
      logResponse(400, { stage: 'role_lookup' });
      return jsonResponse(400, isPublicSubmit ? {
        error: 'Signing unavailable',
        message: 'We could not prepare this document. Please try again or contact the sender.',
      } : {
        error: 'Role not found',
        message: `The role name '${cleanRoleName}' was not found in template ${cleanTemplateId}.`,
      });
    }

    const endpoint = `${cleanDomain}/api/v1/templates/${cleanTemplateId}/createdocument`;

    const payload = {
      templates: {
        request_name: isTest ? `TEST - ${new Date().toLocaleTimeString()}` : `Signature Request - ${signer.name}`,
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: 'SIGN',
            action_id: matchedAction.action_id,
            role: matchedAction.role,
            verify_recipient: false,
            is_embedded: true
          }
        ],
        field_data: {
          field_text_data: {
            'Signer Name': signer.name,
            'Full Name': signer.name,
            'Name': signer.name
          }
        },
        notes: 'Generated via SignFlow Pro - direct link'
      }
    };

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, ZOHO_API_TIMEOUT_MS);

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        error: 'Zoho Response Parse Failure',
        message: `Zoho returned non-JSON response with status ${response.status}`,
      };
    }

    if (response.status === 400 && responseText.includes('action_id')) {
      data.debug_hint = `ROLE ERROR: The role name '${cleanRoleName}' was not found in template ${cleanTemplateId}.`;
    }

    // For embedded signing, call embedtoken endpoint to get final signing URL.
    if (response.ok && data.requests) {
      const request = data.requests;
      const respActions = request?.actions || [];
      const action = respActions[0];

      if (action?.action_id && request?.request_id) {
        const host = process.env.PUBLIC_URL || 'https://www.signflow.ink';
        const embedUrl = `${cleanDomain}/api/v1/requests/${request.request_id}/actions/${action.action_id}/embedtoken`;

        try {
          const embedResponse = await fetchWithTimeout(embedUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host })
          }, ZOHO_API_TIMEOUT_MS);

          if (embedResponse.ok) {
            const embedData = await embedResponse.json();
            if (embedData.sign_url) {
              action.signing_url = embedData.sign_url;
            }
          } else {
            logger.warn('Embed token request failed; continuing with email fallback', {
              zohoStatus: embedResponse.status,
              requestId: request.request_id,
            });
          }
        } catch (embedError) {
          logger.warn('Embed token request threw; continuing with email fallback', {
            requestId: request.request_id,
            error: embedError instanceof Error ? embedError.message : String(embedError),
          });
        }
      }

      if (isPublicSubmit) {
        logResponse(response.status, { stage: 'zoho_submit' });
        return jsonResponse(response.status, {
          requestId: request?.request_id,
          signingUrl: action?.signing_url,
        });
      }
    }

    logResponse(response.status, { stage: 'zoho_submit' });
    return new Response(JSON.stringify(isPublicSubmit && !response.ok ? {
      error: 'Signing unavailable',
      message: 'We could not prepare this document. Please try again or contact the sender.',
    } : data), {
      status: response.status,
      headers: JSON_NO_STORE_HEADERS,
    });
  } catch {
    logResponse(500);
    return jsonResponse(500, {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again.'
    });
  }
}
