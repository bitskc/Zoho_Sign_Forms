
export interface FormDefinition {
  id: string;
  name: string;
  slug: string;
  templateId: string;
  roleName: string;
  apiDomain: string;     // e.g. https://sign.zoho.com
  accessToken?: string;  // Direct token (permanent key)
  createdAt: number;
}

export interface AdminAuth {
  username: string;
  password: string;
}

export interface ServerSettings {
  admin: AdminAuth;
  forms: FormDefinition[];
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
