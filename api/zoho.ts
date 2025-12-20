
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    let { apiDomain, accessToken, templateId, signer, roleName, isTest } = body;

    // 1. Critical Sanitization
    const cleanDomain = (apiDomain || 'https://sign.zoho.com').replace(/\/+$/, '').trim();
    const cleanTemplateId = (templateId || '').trim();
    const cleanRoleName = (roleName || "Signer 1").trim();
    const cleanToken = (accessToken || '').trim();

    // UPDATED: Using /createdocument instead of /requests as suggested by documentation
    const endpoint = `${cleanDomain}/api/v1/templates/${cleanTemplateId}/createdocument`;
    
    // 2. Comprehensive Payload
    const payload = {
      templates: {
        template_id: cleanTemplateId,
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
          "Signer Name": signer.name,
          "FullName": signer.name,
          "Name": signer.name
        }
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${cleanToken}`,
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
    
    // 3. Intelligent Error Hinting for the new endpoint
    if (response.status === 400 && (responseText.includes("No match found") || (data.message && data.message.includes("No match found")))) {
      data.debug_hint = `ZOHO 400 ERROR: 'No match found' persists. 
Verify:
1. ROLE NAME: You used '${cleanRoleName}'. In your Zoho Template, click 'Edit' and check the 'Role Name' column exactly.
2. DATA CENTER: Your domain is '${cleanDomain}'. If your account is in Europe, use sign.zoho.eu.
3. PERMISSIONS: Ensure the API Token has 'ZohoSign.templates.READ' and 'ZohoSign.requests.CREATE' scopes.`;
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
