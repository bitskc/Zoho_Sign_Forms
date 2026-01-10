// Landing page theme configuration
export interface LandingTheme {
  primaryColor: string;      // Main brand color (buttons, links)
  backgroundColor: string;   // Page background
  cardColor: string;         // Form card background
  textColor: string;         // Primary text color
  mutedColor: string;        // Secondary/muted text
  accentColor: string;       // Success/accent color
  darkMode: boolean;         // Dark mode toggle
}

// Contact information for landing page
export interface LandingContact {
  companyName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
}

// Full landing page configuration
export interface LandingConfig {
  headline?: string;         // Main headline (defaults to form name)
  description?: string;      // Description text below headline
  logoUrl?: string;          // Company logo URL
  logoAlt?: string;          // Logo alt text
  theme?: Partial<LandingTheme>;
  contact?: LandingContact;
  footerText?: string;       // Custom footer text
  showPoweredBy?: boolean;   // Show "Powered by SignFlow" badge
  customCss?: string;        // Advanced: custom CSS overrides
  buttonText?: string;       // Custom submit button text (default: "Sign Now")
}

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
  landingConfig?: LandingConfig; // Landing page customization
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
