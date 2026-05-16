import { describe, expect, it } from 'vitest';
import vercelConfig from '../vercel.json';

const getHeaderRule = (source: string) => vercelConfig.headers.find(rule => rule.source === source);
const headerValue = (source: string, key: string) => getHeaderRule(source)?.headers.find(header => header.key === key)?.value;

describe('vercel embed headers', () => {
  it('allows framing only for single-segment embed routes', () => {
    expect(headerValue('/embed/:slug', 'Content-Security-Policy')).toContain('frame-ancestors *');
    expect(headerValue('/embed/:slug', 'X-Frame-Options')).toBeUndefined();
  });

  it('keeps baseline security headers on embeddable pages', () => {
    expect(headerValue('/embed/:slug', 'Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(headerValue('/embed/:slug', 'X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('/embed/:slug', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerValue('/embed/:slug', 'Strict-Transport-Security')).toContain('max-age=63072000');
    expect(headerValue('/embed/:slug', 'Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('blocks framing for invalid embed base and deep paths', () => {
    for (const source of ['/embed', '/embed/:slug/:path*']) {
      expect(headerValue(source, 'X-Frame-Options')).toBe('DENY');
      expect(headerValue(source, 'Content-Security-Policy')).toContain("frame-ancestors 'none'");
    }
  });
});
