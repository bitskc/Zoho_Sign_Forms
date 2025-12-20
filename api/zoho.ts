
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { apiDomain, accessToken, templateId, signer, roleName, isTest } = body;

    const endpoint = `${apiDomain}/api/v1/templates/${templateId}/requests`;
    
    // Construct the Zoho payload
    const payload = {
      templates: {
        request_name: isTest ? `TEST REQUEST - ${new Date().toISOString()}` : `Signature Request - ${signer.name}`,
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: "SIGN",
            role: roleName || "Signer 1",
            verify_recipient: false,
            is_embedded: true
          }
        ],
        // Field data mapping can help avoid "Field mismatch" errors
        field_data: {
          "Signer Name": signer.name,
          "FullName": signer.name
        }
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

    const data = await response.json();
    
    // Pass through the full Zoho status for debugging
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
