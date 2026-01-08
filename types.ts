
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
  qrStableId?: string; // Permanent QR code identifier
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

export interface QRCode {
  id: string;
  formId: string;
  qrCodeData: string; // Base64 encoded QR code image
  stableId: string; // Permanent identifier (e.g., 'qr-abc123')
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsEvent {
  id: string;
  formId: string;
  eventType: 'visit' | 'submit_start' | 'submit_success' | 'submit_error';
  visitorEmail?: string;
  visitorName?: string;
  referrer?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalVisits: number;
  totalSubmissions: number;
  conversionRate: number;
  recentEvents: AnalyticsEvent[];
}
