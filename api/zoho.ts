
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { config: zohoConfig, templateId, signer } = await req.json();

    const endpoint = `${zohoConfig.apiDomain}/api/v1/templates/${templateId}/requests`;
    
    const payload = {
      templates: {
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: "SIGN",
            role: "Signer 1",
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

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: (error as Error).message }), { status: 500 });
  }
}
