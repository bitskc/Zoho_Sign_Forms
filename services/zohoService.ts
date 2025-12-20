
import { ZohoConfig, SignerData, SubmissionResponse, FormDefinition } from '../types';

export const triggerZohoSignTemplate = async (
  config: ZohoConfig,
  form: FormDefinition,
  signer: SignerData
): Promise<SubmissionResponse> => {
  const endpoint = `/api/zoho`;

  try {
    if (!config.accessToken || config.accessToken === 'demo') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        success: true,
        requestId: `DEMO-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        signingUrl: 'https://sign.zoho.com/sign-demo-url'
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        config, 
        templateId: form.templateId, 
        roleName: form.roleName, 
        signer 
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Extract detailed error message from Zoho response
      const errorMessage = data.message || data.error_msg || data.status || "Zoho API Error (400)";
      return { success: false, error: errorMessage };
    }

    const request = data.requests;
    const action = request?.actions?.[0];
    
    return { 
      success: true, 
      requestId: request?.request_id,
      signingUrl: action?.signing_url
    };
  } catch (error) {
    return { success: false, error: "Connection to bridge failed. Check your internet or Vercel logs." };
  }
};
