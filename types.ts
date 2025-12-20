
export interface ZohoConfig {
  adminPassword: string;
}

export interface FormDefinition {
  id: string;
  name: string;
  slug: string;
  templateId: string;
  roleName: string;
  clientId: string;      // New: Zoho Client ID
  clientSecret: string;  // New: Zoho Client Secret
  refreshToken: string;  // New: Zoho Refresh Token
  apiDomain: string;     // e.g. https://sign.zoho.com
  createdAt: number;
  accessToken?: string;  // Optional: cached token
}

export interface SignerData {
  name: string;
  email: string;
}

export interface SubmissionResponse {
  success: boolean;
  requestId?: string;
  signingUrl?: string;
  error?: string;
}

export enum ViewMode {
  PUBLIC_FORM = 'PUBLIC_FORM',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  NOT_FOUND = 'NOT_FOUND'
}
