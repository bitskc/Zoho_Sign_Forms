/**
 * Validates that an API domain string resolves to an allowed Zoho Sign datacenter hostname.
 * Prevents SSRF by ensuring no user-controlled URL can target internal infrastructure.
 *
 * Allowed datacenters: sign.zoho.com, sign.zoho.eu, sign.zoho.in, sign.zoho.com.au, sign.zoho.jp
 */

const ALLOWED_ZOHO_HOSTS = new Set([
  'sign.zoho.com',
  'sign.zoho.eu',
  'sign.zoho.in',
  'sign.zoho.com.au',
  'sign.zoho.jp',
]);

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

/**
 * Validates and normalises a Zoho API domain string.
 * Accepts inputs with or without an https:// scheme.
 * Returns the canonical https URL (e.g. "https://sign.zoho.com") on success.
 * Throws DomainValidationError if the hostname is not in the allowlist.
 */
export function validateZohoDomain(input: string): string {
  const trimmed = input.trim();

  // Add scheme if absent so new URL() can parse the hostname
  const withScheme =
    trimmed.startsWith('https://') || trimmed.startsWith('http://')
      ? trimmed
      : `https://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname.toLowerCase();
  } catch {
    throw new DomainValidationError('Invalid API domain');
  }

  if (!ALLOWED_ZOHO_HOSTS.has(hostname)) {
    throw new DomainValidationError('Invalid API domain');
  }

  // Always return the canonical https:// form (strip any non-standard port, path, etc.)
  return `https://${hostname}`;
}
