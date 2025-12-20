
import { ZohoConfig, SignerData, SubmissionResponse } from '../types';

export const triggerZohoSignTemplate = async (
  config: ZohoConfig,
  templateId: string,
  signer: SignerData
): Promise<SubmissionResponse> => {
  const endpoint = `${config.apiDomain}/api/v1/templates/${templateId}/requests`;
  
  // We set up the request to be "embedded" so we can potentially get a signing link back
  const payload = {
    templates: {
      actions: [
        {
          recipient_name: signer.name,
          recipient_email: signer.email,
          action_type: "SIGN",
          role: "Signer 1",
          verify_recipient: false,
          is_embedded: true // Request embedded signing
        }
      ]
    }
  };

  try {
    if (!config.accessToken || config.accessToken === 'demo') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        success: true,
        requestId: `SIM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        // Simulate an embedded URL for demo purposes
        signingUrl: 'https://sign.zoho.com/sign-demo-url'
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "Zoho API Error" };
    }

    // In a real Zoho API response, if is_embedded is true, 
    // you might need a second call to get the embedded token/link
    // but some flows return the link in the action object.
    const action = data.requests?.actions?.[0];
    const signingUrl = action?.signing_url || '';

    return { 
      success: true, 
      requestId: data.requests?.request_id,
      signingUrl: signingUrl
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};
