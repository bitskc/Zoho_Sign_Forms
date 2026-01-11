/**
 * URL Validation Utility
 * 
 * Validates URLs for security to prevent SSRF, phishing, and malicious redirects.
 * Only allows HTTPS URLs from public internet addresses.
 */

/**
 * Validate a URL for safety
 * @param url - The URL to validate
 * @returns true if URL is valid and safe, false otherwise
 */
export function validateUrl(url: string | undefined): boolean {
  if (!url) return true; // Optional field - empty/undefined is valid
  
  // Must be a valid URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // Invalid URL format
  }
  
  // Only allow HTTPS protocol (reject http, file, javascript, data URIs)
  if (parsed.protocol !== 'https:') {
    return false;
  }
  
  // Block localhost and private IP ranges (SSRF protection)
  const hostname = parsed.hostname.toLowerCase();
  
  // Block localhost
  if (hostname === 'localhost' || hostname === '[::1]') {
    return false;
  }
  
  // Block 127.x.x.x (loopback)
  if (hostname.startsWith('127.')) {
    return false;
  }
  
  // Block private IP ranges
  // 192.168.x.x (private)
  if (hostname.startsWith('192.168.')) {
    return false;
  }
  
  // 10.x.x.x (private)
  if (hostname.startsWith('10.')) {
    return false;
  }
  
  // 172.16.x.x - 172.31.x.x (private)
  if (hostname.startsWith('172.')) {
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) {
        return false;
      }
    }
  }
  
  // Block link-local addresses (169.254.x.x)
  if (hostname.startsWith('169.254.')) {
    return false;
  }
  
  return true;
}

/**
 * Sanitize a URL or throw an error if invalid
 * @param url - The URL to sanitize
 * @returns The validated URL or undefined
 * @throws Error if URL is invalid or unsafe
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  
  if (!validateUrl(url)) {
    throw new Error('Invalid or unsafe URL. Only HTTPS URLs from public addresses are allowed.');
  }
  
  return url.trim();
}

/**
 * Get a user-friendly error message for URL validation failures
 * @param url - The URL that failed validation
 * @returns A descriptive error message
 */
export function getUrlValidationError(url: string): string {
  if (!url) return 'URL is required';
  
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format. Must be a complete URL (e.g., https://example.com/image.png)';
  }
  
  if (parsed.protocol !== 'https:') {
    return `Invalid protocol: ${parsed.protocol}. Only HTTPS URLs are allowed for security.`;
  }
  
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('169.254.')
  ) {
    return 'Private or localhost URLs are not allowed for security reasons.';
  }
  
  if (hostname.startsWith('172.')) {
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) {
        return 'Private IP addresses are not allowed for security reasons.';
      }
    }
  }
  
  return 'URL validation failed';
}
