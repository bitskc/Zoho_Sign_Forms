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
  buttonText?: string;       // Custom submit button text (default: "Sign Now")
}

export interface FormDefinition {
  id?: string; // optional: undefined for new forms before DB insert assigns a UUID
  userId?: string;
  name: string;
  slug: string;
  templateId: string;
  roleName: string;
  apiDomain: string;
  accessToken?: string; // deprecated; kept for backward compatibility
  createdAt?: number | null;
  qrStableId?: string; // Permanent QR code identifier used by the app (preferred field)
  landingConfig?: LandingConfig; // Landing page customization
  signerConfig?: SignerConfig; // Per-role signer/delivery overrides (excludes the public signer role)
  qrCodeData?: string; // URL to QR code image (e.g., https://api.qrserver.com/...)
  qrStableIdFromDb?: string; // Raw stable ID loaded from the database (used for sync/migrations)
  qrCreatedAt?: string; // QR code creation timestamp
  requestedSlug?: string; // Public URL slug used to load this form, including historical aliases
}

export interface UserCredentials {
  clientId: string;
  apiDomain?: string;
  /** True if a client secret has been saved server-side. The secret itself is never returned. */
  hasClientSecret: boolean;
  /** True if a refresh token has been saved server-side. The token itself is never returned. */
  hasRefreshToken: boolean;
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

/**
 * Delivery mode for a configured role.
 * - "embedded": Zoho returns an inline signing URL (current behavior).
 * - "email":    Zoho emails the signing request to the recipient; no embed token is fetched.
 */
export type DeliveryMode = 'embedded' | 'email';

/**
 * Admin-configured override for a single template role.
 *
 * The public signer's role (matched by FormDefinition.roleName) is NOT stored
 * here — it is collected from the public form at submit time. Only the
 * additional/internal roles (other signers, approvers, and "receives a copy"
 * / VIEW recipients) are configured by the admin.
 */
export interface SignerRoleConfig {
  /** Template role name; must match a role returned by the Zoho template. */
  role: string;
  /** Template action type for this role. Preserved as-is from the template. */
  actionType: 'SIGN' | 'VIEW' | 'APPROVER' | 'INPERSONSIGN';
  /** Fixed recipient name (admin-configured). */
  recipientName?: string;
  /** Fixed recipient email (admin-configured). */
  recipientEmail?: string;
  /** How this role receives the request. Defaults to "email" for non-public roles. */
  deliveryMode?: DeliveryMode;
  /** True if this role is filled by the public submitter (read-only in UI). */
  isPublic?: boolean;
}

/**
 * Per-form signer/delivery configuration stored in the forms.signer_config column.
 */
export interface SignerConfig {
  /** Optional override for the Zoho request notes sent to all recipients. */
  notes?: string;
  /** Configured overrides for each non-public template role. */
  roles: SignerRoleConfig[];
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
  FORM_DETAILS = 'FORM_DETAILS',
  NOT_FOUND = 'NOT_FOUND'
}

export interface QRCode {
  id: string;
  formId: string;
  qrCodeData: string; // URL to QR code image (e.g., https://api.qrserver.com/...)
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
