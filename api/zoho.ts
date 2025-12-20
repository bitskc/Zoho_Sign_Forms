
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

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { action, apiDomain, clientId, clientSecret, refreshToken, grantToken, redirectUri } = body;

    // --- CASE 1: Initial OAuth Exchange (Grant Token -> Refresh Token) ---
    if (action === 'exchange') {
      const params = new URLSearchParams();
      params.append('code', grantToken);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
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
    const { templateId, signer, roleName, isTest } = body;
    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(JSON.stringify({ 
        error: 'Missing credentials', 
        message: 'clientId, clientSecret, and refreshToken are required.' 
      }), { status: 400 });
    }
    if (!templateId || !signer?.name || !signer?.email) {
      return new Response(JSON.stringify({ 
        error: 'Missing data', 
        message: 'templateId, signer.name, and signer.email are required.' 
      }), { status: 400 });
    }

    const cleanDomain = (apiDomain || 'https://sign.zoho.com').replace(/\/+$/, '').trim();
    const cleanTemplateId = (templateId || '').trim();
    const cleanRoleName = (roleName || "Signer 1").trim();
    
    const refreshParams = new URLSearchParams();
    refreshParams.append('refresh_token', refreshToken);
    refreshParams.append('client_id', clientId);
    refreshParams.append('client_secret', clientSecret);
    refreshParams.append('grant_type', 'refresh_token');

    let accessToken: string;
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

    const endpoint = `${cleanDomain}/api/v1/templates/${cleanTemplateId}/createdocument`;
    
    const payload = {
      templates: {
        request_name: isTest ? `TEST - ${new Date().toLocaleTimeString()}` : `Signature Request - ${signer.name}`,
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: "SIGN",
            role: cleanRoleName,
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
        notes: "Generated via SignFlow Pro"
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
