
import { ZohoConfig, SignerData, SubmissionResponse } from '../types';

export const triggerZohoSignTemplate = async (
  config: ZohoConfig,
  templateId: string,
  signer: SignerData
): Promise<SubmissionResponse> => {
  // We hit our own API route instead of Zoho directly to bypass CORS
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
      body: JSON.stringify({ config, templateId, signer })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || data.error || "Zoho API Error" };
    }

    const request = data.requests;
    const action = request?.actions?.[0];
    
    return { 
      success: true, 
      requestId: request?.request_id,
      signingUrl: action?.signing_url
    };
  } catch (error) {
    return { success: false, error: "Connection to bridge failed. Ensure you are running on Vercel or a supporting server." };
  }
};
