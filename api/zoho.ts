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

export const config = {
  runtime: 'edge',
};

/**
 * Maps a validated Zoho Sign hostname to its corresponding Zoho Accounts OAuth URL.
 * NOTE: apiDomain is validated against the allowlist before this function is called,
 * so the derived accountsUrl is implicitly safe.
 */
function getAccountsUrl(apiDomain: string) {
  if (apiDomain.includes('.eu')) return 'https://accounts.zoho.eu';
  if (apiDomain.includes('.in')) return 'https://accounts.zoho.in';
  if (apiDomain.includes('.com.au')) return 'https://accounts.zoho.com.au';
  if (apiDomain.includes('.jp')) return 'https://accounts.zoho.jp';
  return 'https://accounts.zoho.com';
}

async function getOAuthToken(params: URLSearchParams, apiDomain: string) {
  const accountsUrl = `${getAccountsUrl(apiDomain)}/oauth/v2/token`;

  const response = await fetch(accountsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: params,
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'OAuth Request Failed');
  }
  return data;
}

export default async function handler(req: Request) {
  const { logger, logResponse } = createRequestLogger(req);

  // Periodic cleanup
  if (Math.random() < 0.01) {
    cleanupRateLimitStore();
  }

  if (req.method !== 'POST') {
    logResponse(405);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Allow': 'POST' }
    });
  }

  try {
    const body = await req.json();
    const { action, apiDomain, clientId, clientSecret, refreshToken, grantToken, redirectUri } = body;
    // NOTE: `userId` is intentionally NOT destructured from body — it must never be
    // trusted from the client. The server resolves the form owner from the database.

    logger.debug('Request body received', sanitizeLogContext({
      action,
      apiDomain,
      clientId: clientId ? '[PROVIDED]' : '[ENV]',
      clientSecret: clientSecret ? '[PROVIDED]' : '[ENV]',
      templateId: body.templateId?.slice(0, 8),
    }));

    // Apply rate limiting (IP-based for untrusted requests)
    const rateLimitKey = getRateLimitKey(req);
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

      // Validate apiDomain before using it in fetch (P1-01: SSRF prevention)
      let cleanExchangeDomain: string;
      try {
        cleanExchangeDomain = validateZohoDomain(apiDomain || 'sign.zoho.com');
      } catch (e) {
        if (e instanceof DomainValidationError) {
          logResponse(400);
          return new Response(JSON.stringify({ error: 'Invalid API domain' }), { status: 400 });
        }
        throw e;
      }

      const params = new URLSearchParams();
      params.append('code', grantToken);
      params.append('client_id', resolvedClientId || '');
      params.append('client_secret', resolvedClientSecret || '');
      params.append('redirect_uri', redirectUri || 'https://api-console.zoho.com');
      params.append('grant_type', 'authorization_code');

      try {
        const data = await getOAuthToken(params, cleanExchangeDomain);
        logger.info('OAuth token exchange successful');
        logResponse(200, { action: 'exchange' });
        return new Response(JSON.stringify(data), { status: 200 });
      } catch (e: any) {
        logger.error('OAuth token exchange failed', e);
        logResponse(400, { action: 'exchange' });
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }
    }

    // --- CASE 2: Standard Sign Request ---
    const { templateId, signer, roleName, isTest, accessToken: providedAccessToken,
      clientId: providedClientId, clientSecret: providedClientSecret } = body;

    // P1-01: Validate apiDomain against allowlist before any further use.
    // Default to sign.zoho.com if not provided.
    let cleanDomain: string;
    try {
      cleanDomain = validateZohoDomain((apiDomain || 'sign.zoho.com').replace(/\/+$/, '').trim());
    } catch (e) {
      if (e instanceof DomainValidationError) {
        logResponse(400);
        return new Response(JSON.stringify({ error: 'Invalid API domain' }), { status: 400 });
      }
      throw e;
    }

    // P1-02: Determine the form owner server-side — never trust userId from request body.
    // Check if this is an authenticated admin/test request.
    const authHeader = req.headers.get('Authorization');
    let authedUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const { data: authData, error: authErr } = await supabaseServer.auth.getUser(token);
      if (!authErr && authData.user) {
        authedUserId = authData.user.id;
      }
    }

    let effectiveClientId = providedClientId || resolvedClientId;
    let effectiveClientSecret = providedClientSecret || resolvedClientSecret;
    let effectiveRefreshToken = refreshToken;

    // Load credentials from database via templateId lookup (not userId from body)
    if (!effectiveClientId || !effectiveClientSecret || !effectiveRefreshToken) {
      if (!templateId) {
        return new Response(JSON.stringify({
          error: 'Missing data',
          message: 'templateId is required.'
        }), { status: 400 });
      }

      // Resolve form owner from templateId
      const { data: formRow, error: formErr } = await supabaseServer
        .from('forms')
        .select('user_id')
        .eq('template_id', templateId)
        .limit(1)
        .maybeSingle();

      if (formErr || !formRow) {
        logger.warn('Form not found for templateId', { templateId: templateId?.slice(0, 8) });
        logResponse(404);
        return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 });
      }

      const resolvedUserId = formRow.user_id;

      // If authenticated, verify the caller owns this form
      if (authedUserId && authedUserId !== resolvedUserId) {
        logResponse(403);
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
      }

      const { data: credRow, error: credErr } = await supabaseServer
        .from('user_credentials')
        .select('zoho_client_id,zoho_client_secret,zoho_refresh_token,api_domain')
        .eq('user_id', resolvedUserId)
        .maybeSingle();

      if (!credErr && credRow) {
        effectiveClientId = effectiveClientId || credRow.zoho_client_id;
        effectiveClientSecret = effectiveClientSecret || credRow.zoho_client_secret;
        effectiveRefreshToken = effectiveRefreshToken || credRow.zoho_refresh_token;
        // Only use stored apiDomain if none was provided (already validated above)
        if (!apiDomain && credRow.api_domain) {
          try {
            cleanDomain = validateZohoDomain(credRow.api_domain);
          } catch {
            // Keep the default cleanDomain if stored value is invalid
          }
        }
      }
    }

    if (!providedAccessToken && (!effectiveClientId || !effectiveClientSecret || !effectiveRefreshToken)) {
      return new Response(JSON.stringify({
        error: 'Missing credentials',
        message: 'clientId/clientSecret must be set on the server and refreshToken provided unless you pass accessToken.'
      }), { status: 400 });
    }
    if (!templateId || !signer?.name || !signer?.email) {
      return new Response(JSON.stringify({
        error: 'Missing data',
        message: 'templateId, signer.name, and signer.email are required.'
      }), { status: 400 });
    }

    const cleanTemplateId = (templateId || '').trim();
    const cleanRoleName = (roleName || "Signer 1").trim();

    let accessToken: string | undefined = providedAccessToken;
    if (!accessToken) {
      const refreshParams = new URLSearchParams();
      refreshParams.append('refresh_token', effectiveRefreshToken);
      refreshParams.append('client_id', effectiveClientId || '');
      refreshParams.append('client_secret', effectiveClientSecret || '');
      refreshParams.append('grant_type', 'refresh_token');

      try {
        const authData = await getOAuthToken(refreshParams, cleanDomain);
        accessToken = authData.access_token;
      } catch (authError: any) {
        return new Response(JSON.stringify({
          error: 'Authentication Failure',
          message: authError.message,
          hint: "Your Refresh Token might be invalid or your Client ID/Secret do not match."
        }), { status: 401 });
      }
    }

    // Fetch template to resolve the correct action_id for the requested role
    const templateInfo = await fetch(`${cleanDomain}/api/v1/templates/${cleanTemplateId}`, {
      method: 'GET',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
    });
    if (!templateInfo.ok) {
      const txt = await templateInfo.text();
      return new Response(JSON.stringify({ error: 'Template fetch failed', message: txt }), { status: 400 });
    }
    const templateData = await templateInfo.json();
    const actions = templateData?.templates?.actions || [];
    const matchedAction = actions.find((a: any) => (a.role || '').trim().toLowerCase() === cleanRoleName.toLowerCase());
    if (!matchedAction?.action_id) {
      return new Response(JSON.stringify({
        error: 'Role not found',
        message: `ROLE ERROR: The role name '${cleanRoleName}' was not found in template ${cleanTemplateId}.`
      }), { status: 400 });
    }

    const endpoint = `${cleanDomain}/api/v1/templates/${cleanTemplateId}/createdocument`;

    const payload = {
      templates: {
        request_name: isTest ? `TEST - ${new Date().toLocaleTimeString()}` : `Signature Request - ${signer.name}`,
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: "SIGN",
            action_id: matchedAction.action_id,
            role: matchedAction.role,
            verify_recipient: false,
            is_embedded: true
          }
        ],
        field_data: {
          field_text_data: {
            "Signer Name": signer.name,
            "Full Name": signer.name,
            "Name": signer.name
          }
        },
        notes: "Generated via SignFlow Pro - direct link"
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { error: "Non-JSON Response", raw: responseText };
    }

    if (response.status === 400 && responseText.includes("action_id")) {
      data.debug_hint = `ROLE ERROR: The role name '${cleanRoleName}' was not found in template ${cleanTemplateId}.`;
    }

    // For embedded signing, make the embedtoken API call to get the proper signing URL
    if (response.ok && data.requests) {
      const request = data.requests;
      const respActions = request?.actions || [];
      const action = respActions[0];

      if (action?.action_id && request?.request_id) {
        const host = process.env.PUBLIC_URL || 'https://www.signflow.ink';
        const embedUrl = `${cleanDomain}/api/v1/requests/${request.request_id}/actions/${action.action_id}/embedtoken`;

        try {
          const embedResponse = await fetch(embedUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host })
          });

          if (embedResponse.ok) {
            const embedData = await embedResponse.json();
            if (embedData.sign_url) {
              action.signing_url = embedData.sign_url;
            }
          }
        } catch (embedError) {
          // Silently continue — user will receive email link instead
        }
      }
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: (error as Error).message
    }), { status: 500 });
  }
}
