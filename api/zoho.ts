
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { config: zohoConfig, templateId, signer, roleName } = body;

    const endpoint = `${zohoConfig.apiDomain}/api/v1/templates/${templateId}/requests`;
    
    // Construct the Zoho payload
    // request_name is often mandatory for successful template triggering
    const payload = {
      templates: {
        request_name: `Signature Request - ${signer.name}`,
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: "SIGN",
            role: roleName || "Signer 1", // Use the user-provided role name
            verify_recipient: false,
            is_embedded: true
          }
        ]
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${zohoConfig.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { error: "Raw Response", message: responseText };
    }
    
    // Return exactly what Zoho said so the frontend can display it
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
