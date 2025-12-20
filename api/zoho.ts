
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

    // Sanitize inputs
    apiDomain = apiDomain.replace(/\/+$/, ''); // Remove trailing slashes
    templateId = templateId.trim();
    roleName = (roleName || "Signer 1").trim();

    const endpoint = `${apiDomain}/api/v1/templates/${templateId}/requests`;
    
    // Construct the Zoho payload
    // Note: Some Zoho data centers require template_id both in URL and Body
    const payload = {
      templates: {
        template_id: templateId,
        request_name: isTest ? `TEST - ${new Date().toLocaleTimeString()}` : `Signature Request - ${signer.name}`,
        actions: [
          {
            recipient_name: signer.name,
            recipient_email: signer.email,
            action_type: "SIGN",
            role: roleName,
            verify_recipient: false,
            is_embedded: true
          }
        ],
        // Field data helps map placeholders in the template
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
    
    // Check for "No match found" specifically to add helpful debugging hints
    if (response.status === 400 && (responseText.includes("No match found") || data.message?.includes("No match found"))) {
      data.debug_hint = "Common causes for 'No match found': 1. Incorrect Template ID. 2. Role Name (e.g., '" + roleName + "') does not match the template exactly. 3. Incorrect API Domain (e.g., using .com for an .eu account).";
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
