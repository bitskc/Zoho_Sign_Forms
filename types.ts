
export interface FormDefinition {
  id: string;
  userId?: string;
  name: string;
  slug: string;
  templateId: string;
  roleName: string;
  apiDomain: string;
  accessToken?: string; // deprecated; kept for backward compatibility
  createdAt?: number | null;
}

export interface UserCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiDomain?: string;
}

export interface SubscriptionPlan {
  plan: string;
  status: string;
  seats?: number;
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
  LANDING = 'LANDING',
  PUBLIC_FORM = 'PUBLIC_FORM',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  ADMIN_SETTINGS = 'ADMIN_SETTINGS',
  NOT_FOUND = 'NOT_FOUND'
}
