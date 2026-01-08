
export const config = {
  runtime: 'edge',
};

/**
 * Maps the API domain to the correct Zoho Accounts URL for OAuth
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

import { supabaseServer } from './_supabaseServer';

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { action, apiDomain, clientId, clientSecret, refreshToken, grantToken, redirectUri } = body;
    const resolvedClientId = clientId || process.env.ZOHO_CLIENT_ID;
    const resolvedClientSecret = clientSecret || process.env.ZOHO_CLIENT_SECRET;

    // --- CASE 1: Initial OAuth Exchange (Grant Token -> Refresh Token) ---
    if (action === 'exchange') {
      const params = new URLSearchParams();
      params.append('code', grantToken);
      params.append('client_id', resolvedClientId || '');
      params.append('client_secret', resolvedClientSecret || '');
      // The redirect_uri MUST match the one used to generate the code originally
      params.append('redirect_uri', redirectUri || 'https://api-console.zoho.com');
      params.append('grant_type', 'authorization_code');
      
      try {
        const data = await getOAuthToken(params, apiDomain || 'sign.zoho.com');
        return new Response(JSON.stringify(data), { status: 200 });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }
    }

    // --- CASE 2: Standard Sign Request ---
    const { templateId, signer, roleName, isTest, accessToken: providedAccessToken, clientId: providedClientId, clientSecret: providedClientSecret, userId } = body;

    let effectiveClientId = providedClientId || resolvedClientId;
    let effectiveClientSecret = providedClientSecret || resolvedClientSecret;
    let effectiveRefreshToken = refreshToken;
    let effectiveApiDomain = apiDomain;

    // If creds not provided, try to load from Supabase by userId
    if ((!effectiveClientId || !effectiveClientSecret || !effectiveRefreshToken) && userId) {
      const { data: credRow, error: credErr } = await supabaseServer
        .from('user_credentials')
        .select('zoho_client_id,zoho_client_secret,zoho_refresh_token,api_domain')
        .eq('user_id', userId)
        .maybeSingle();
      if (!credErr && credRow) {
        effectiveClientId = effectiveClientId || credRow.zoho_client_id;
        effectiveClientSecret = effectiveClientSecret || credRow.zoho_client_secret;
        effectiveRefreshToken = effectiveRefreshToken || credRow.zoho_refresh_token;
        effectiveApiDomain = effectiveApiDomain || credRow.api_domain;
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

    const cleanDomain = (effectiveApiDomain || 'https://sign.zoho.com').replace(/\/+$/, '').trim();
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
            // embedded signing typically suppresses Zoho emails; we still surface the signing_url to open directly
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
    // This is now MANDATORY for successful sign requests
    if (response.ok && data.requests) {
      const request = data.requests;
      const actions = request?.actions || [];
      const action = actions[0];
      
      if (action?.action_id && request?.request_id) {
        console.log('=== EMBED TOKEN REQUEST ===');
        console.log('Making embedtoken API call...');
        // Use PUBLIC_URL environment variable for security (prevents header-based attacks)
        const host = process.env.PUBLIC_URL || 'https://www.signflow.ink';
        const embedUrl = `${cleanDomain}/api/v1/requests/${request.request_id}/actions/${action.action_id}/embedtoken`;
        console.log('Embed URL:', embedUrl);
        console.log('Host parameter:', host);
        console.log('Access token present:', !!accessToken);
        
        try {
          const embedResponse = await fetch(embedUrl, {
            method: 'POST',
            headers: { 
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host })
          });
          
          console.log('Embed response status:', embedResponse.status);
          console.log('Embed response ok:', embedResponse.ok);
          
          if (!embedResponse.ok) {
            const embedErrorText = await embedResponse.text();
            console.error('=== EMBED TOKEN FAILED ===');
            console.error('Status:', embedResponse.status);
            console.error('Error text:', embedErrorText);
            console.error('This means user will receive EMAIL LINK instead of embedded signing');
            console.error('=== END EMBED TOKEN ERROR ===');
            // Don't fail the entire request - just log the error and continue
            // User will receive email link instead of embedded signing
          } else {
            const embedData = await embedResponse.json();
            console.log('=== EMBED TOKEN SUCCESS ===');
            console.log('Embed response data:', JSON.stringify(embedData));
            
            // Update the action with the embed signing URL if available
            if (embedData.sign_url) {
              action.signing_url = embedData.sign_url;
              console.log('✓ Updated signing URL from embed token:', embedData.sign_url);
              console.log('=== END EMBED TOKEN SUCCESS ===');
            } else {
              console.warn('=== EMBED TOKEN MISSING SIGN_URL ===');
              console.warn('Response data:', JSON.stringify(embedData));
              console.warn('User will receive email link instead');
              console.warn('=== END EMBED TOKEN WARNING ===');
            }
          }
        } catch (embedError) {
          console.error('=== EMBED TOKEN EXCEPTION ===');
          console.error('Error:', embedError);
          console.error('Error message:', (embedError as Error).message);
          console.error('Error stack:', (embedError as Error).stack);
          console.error('User will receive email link instead');
          console.error('=== END EMBED TOKEN EXCEPTION ===');
        }
      } else {
        console.warn('=== MISSING IDs FOR EMBED TOKEN ===');
        console.warn('action_id:', action?.action_id);
        console.warn('request_id:', request?.request_id);
        console.warn('=== END MISSING IDs ===');
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
