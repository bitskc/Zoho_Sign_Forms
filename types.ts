
export interface ZohoConfig {
  adminPassword: string;
}

export interface FormDefinition {
  id: string;
  name: string;
  slug: string;
  templateId: string;
  roleName: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  redirectUri: string;   // New: Custom redirect URI to match Zoho Console
  apiDomain: string;     // e.g. https://sign.zoho.com
  createdAt: number;
  accessToken?: string;
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
