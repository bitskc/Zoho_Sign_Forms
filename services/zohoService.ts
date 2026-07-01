
import { SignerData, SubmissionResponse, FormDefinition } from '../types';

/**
 * Standard trigger for public signature requests
 */
type ZohoCreds = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  apiDomain?: string;
  // userId is forwarded to the server for logging/auditing purposes only.
  // The server ignores it and resolves the form owner from the database (CRIT-01 fix).
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

    const includeAdminOverrides = Boolean(
      isTest ||
      creds?.clientId ||
      creds?.clientSecret ||
      creds?.refreshToken ||
      creds?.apiDomain
    );

    const payload: Record<string, unknown> = {
      formId: form.id,
      slug: form.requestedSlug || form.slug,
      signer,
      isTest,
    };

    if (includeAdminOverrides) {
      payload.apiDomain = creds?.apiDomain || form.apiDomain;
      payload.refreshToken = creds?.refreshToken;
      payload.clientId = creds?.clientId;
      payload.clientSecret = creds?.clientSecret;
      payload.userId = creds?.userId;
      payload.templateId = form.templateId;
      payload.roleName = form.roleName;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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

    if (data.requestId || data.signingUrl) {
      return {
        success: true,
        requestId: data.requestId,
        signingUrl: data.signingUrl,
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
export const testZohoConnection = async (form: FormDefinition, creds?: ZohoCreds) => {
  return triggerZohoSignTemplate(
    form,
    { name: "System Test", email: "test@example.com" },
    true,
    creds
  );
};

/**
 * A single role returned by the Zoho template lookup.
 */
export interface TemplateRole {
  role: string;
  actionType: 'SIGN' | 'VIEW' | 'APPROVER' | 'INPERSONSIGN';
  actionId: string;
  isPublic: boolean;
}

/**
 * Fetch the roles (actions) defined in a Zoho Sign template so the admin can
 * configure signers/delivery per role. Requires the form owner's session token.
 */
export const fetchTemplateRoles = async (
  formId: string,
  sessionToken: string,
  creds?: ZohoCreds
): Promise<{ success: boolean; roles?: TemplateRole[]; error?: string }> => {
  try {
    const payload: Record<string, unknown> = {
      action: 'template',
      formId,
    };
    if (creds?.apiDomain) payload.apiDomain = creds.apiDomain;
    if (creds?.clientId) payload.clientId = creds.clientId;
    if (creds?.clientSecret) payload.clientSecret = creds.clientSecret;
    if (creds?.refreshToken) payload.refreshToken = creds.refreshToken;

    const response = await fetch('/api/zoho', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.message || data.error || `Zoho Error (${response.status})` };
    }
    return { success: true, roles: data.roles || [] };
  } catch (error) {
    return { success: false, error: `Bridge Error: ${(error as Error).message}` };
  }
};
