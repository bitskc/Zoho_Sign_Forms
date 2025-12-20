
import { SignerData, SubmissionResponse, FormDefinition } from '../types';

/**
 * Standard trigger for public signature requests
 */
export const triggerZohoSignTemplate = async (
  form: FormDefinition,
  signer: SignerData,
  isTest: boolean = false
): Promise<SubmissionResponse> => {
  const endpoint = `/api/zoho`;

  try {
    if (!form.accessToken || form.accessToken === 'demo') {
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
        apiDomain: form.apiDomain,
        accessToken: form.accessToken,
        templateId: form.templateId, 
        roleName: form.roleName, 
        signer,
        isTest
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Return the most detailed info possible for debugging
      const detail = data.message || data.error_msg || JSON.stringify(data);
      return { 
        success: false, 
        error: `Zoho rejected the request (${response.status}): ${detail}`
      };
    }

    // Check for Zoho-specific application errors that might return 200 but have failure codes
    if (data.status === 'failure') {
      return { 
        success: false, 
        error: data.message || "Zoho application error" 
      };
    }

    const request = data.requests;
    const action = request?.actions?.[0];
    
    return { 
      success: true, 
      requestId: request?.request_id,
      signingUrl: action?.signing_url
    };
  } catch (error) {
    return { success: false, error: `Bridge Error: ${(error as Error).message}` };
  }
};

/**
 * Convenience wrapper for testing a connection
 */
export const testZohoConnection = async (form: FormDefinition) => {
  return triggerZohoSignTemplate(
    form, 
    { name: "System Test", email: "test@example.com" },
    true
  );
};
