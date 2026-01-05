
import { SignerData, SubmissionResponse, FormDefinition } from '../types';

/**
 * Standard trigger for public signature requests
 */
type ZohoCreds = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  apiDomain?: string;
  userId?: string;
};

export const triggerZohoSignTemplate = async (
  form: FormDefinition,
  signer: SignerData,
  isTest: boolean = false,
  creds?: ZohoCreds
): Promise<SubmissionResponse> => {
  const endpoint = `/api/zoho`;

  try {
    if (!form.accessToken) {
      if (form.id === 'demo-id') {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return {
          success: true,
          requestId: `DEMO-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          signingUrl: 'https://sign.zoho.com/sign-demo-url'
        };
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        apiDomain: creds?.apiDomain || form.apiDomain,
        refreshToken: creds?.refreshToken,
        clientId: creds?.clientId,
        clientSecret: creds?.clientSecret,
        userId: creds?.userId,
        templateId: form.templateId, 
        roleName: form.roleName, 
        signer,
        isTest
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data.message || data.error || data.error_msg || data.debug_hint || JSON.stringify(data);
      // Preserve a specific hint for role mismatch if Zoho mentions action_id
      const hint = data.debug_hint || (typeof detail === 'string' && detail.includes('action_id') 
        ? 'Role mismatch: verify the role name exactly matches the template.' 
        : undefined);
      return { 
        success: false, 
        error: `Zoho Error (${response.status}): ${detail}${data.hint ? ` — ${data.hint}` : ''}`
      };
    }

    const request = data.requests;
    const actions = request?.actions || [];
    const action = actions[0];
    
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
 * Exchange a one-time Grant Token (code) for a permanent Refresh Token
 */
export const exchangeToken = async (
  clientId: string,
  clientSecret: string,
  grantToken: string,
  apiDomain: string,
  redirectUri: string
) => {
  try {
    const response = await fetch('/api/zoho', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'exchange',
        clientId,
        clientSecret,
        grantToken,
        apiDomain,
        redirectUri
      })
    });
    return await response.json();
  } catch (e) {
    return { error: (e as Error).message };
  }
};

/**
 * Convenience wrapper for testing a connection
 */
export const testZohoConnection = async (form: FormDefinition, creds?: { clientId: string; clientSecret: string; refreshToken: string; apiDomain?: string; userId?: string }) => {
  return triggerZohoSignTemplate(
    form, 
    { name: "System Test", email: "test@example.com" },
    true,
    creds
  );
};
