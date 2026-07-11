import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSubdomainType,
  getRouteContext,
  buildFormUrl,
  getEmbedFormSlugFromPath,
  getPublicFormSlugFromPath,
  isValidPublicFormSlug,
} from '../services/routingService';

// Helper to mock window.location in a controlled way
function mockLocation(url: string) {
  const loc = new URL(url);
  // @ts-ignore
  delete global.window.location;
  // @ts-ignore
  global.window.location = {
    href: loc.href,
    protocol: loc.protocol,
    hostname: loc.hostname,
    port: loc.port,
    pathname: loc.pathname,
    search: loc.search,
    hash: loc.hash,
  } as any;
}

describe('routingService.getSubdomainType', () => {
  it('detects root domain', () => {
    expect(getSubdomainType('signflow.ink')).toBe('root');
  });

  it('detects www subdomain', () => {
    expect(getSubdomainType('www.signflow.ink')).toBe('www');
  });

  it('detects app subdomain', () => {
    expect(getSubdomainType('app.signflow.ink')).toBe('app');
  });

  it('treats localhost as www by default', () => {
    expect(getSubdomainType('localhost')).toBe('www');
  });
});

describe('routingService.getRouteContext', () => {
  beforeEach(() => {
    // @ts-ignore
    global.window = global.window || {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes a clean form slug on www', () => {
    mockLocation('https://www.signflow.ink/fbmc');
    const ctx = getRouteContext();
    expect(ctx.subdomain).toBe('www');
    expect(ctx.isFormSlug).toBe(true);
    expect(ctx.formSlug).toBe('fbmc');
  });

  it('does not treat /api paths as slugs', () => {
    mockLocation('https://www.signflow.ink/api/health');
    const ctx = getRouteContext();
    expect(ctx.isFormSlug).toBe(false);
    expect(ctx.formSlug).toBeNull();
  });

  it('does not treat reserved paths as form slugs', () => {
    for (const path of ['/admin', '/assets', '/static', '/public', '/_next', '/favicon.ico', '/qr/abc', '/embed', '/guides']) {
      mockLocation(`https://www.signflow.ink${path}`);
      const ctx = getRouteContext();
      expect(ctx.isFormSlug).toBe(false);
      expect(ctx.formSlug).toBeNull();
    }
  });

  it('recognizes embed form routes', () => {
    mockLocation('https://www.signflow.ink/embed/fbmc');
    const ctx = getRouteContext();
    expect(ctx.isFormSlug).toBe(true);
    expect(ctx.formSlug).toBe('fbmc');
  });
});

describe('routingService public form slug helpers', () => {
  it('accepts only single-segment public form slugs', () => {
    expect(getPublicFormSlugFromPath('/fbmc')).toBe('fbmc');
    expect(getPublicFormSlugFromPath('/fbmc/')).toBe('fbmc');
    expect(getPublicFormSlugFromPath('/fbmc/extra')).toBeNull();
    expect(getPublicFormSlugFromPath('/')).toBeNull();
  });

  it('accepts only /embed/:slug embed paths', () => {
    expect(getEmbedFormSlugFromPath('/embed/fbmc')).toBe('fbmc');
    expect(getEmbedFormSlugFromPath('/embed/fbmc/')).toBe('fbmc');
    expect(getEmbedFormSlugFromPath('/embed/admin')).toBeNull();
    expect(getEmbedFormSlugFromPath('/embed/fbmc/extra')).toBeNull();
    expect(getEmbedFormSlugFromPath('/fbmc')).toBeNull();
  });

  it('rejects invalid and reserved public form slugs', () => {
    expect(isValidPublicFormSlug('fbmc-short')).toBe(true);
    expect(isValidPublicFormSlug('BadSlug')).toBe(false);
    expect(isValidPublicFormSlug('admin')).toBe(false);
    expect(isValidPublicFormSlug('qr')).toBe(false);
    expect(isValidPublicFormSlug('embed')).toBe(false);
    expect(isValidPublicFormSlug('guides')).toBe(false);
    expect(isValidPublicFormSlug('favicon.ico')).toBe(false);
  });
});

describe('routingService.buildFormUrl', () => {
  beforeEach(() => {
    // @ts-ignore
    global.window = global.window || {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns www host for production domains', () => {
    mockLocation('https://app.signflow.ink/fbmc');
    const url = buildFormUrl('fbmc');
    expect(url).toBe('https://www.signflow.ink/fbmc');
  });

  it('preserves localhost and port in dev', () => {
    mockLocation('http://localhost:5173/fbmc');
    const url = buildFormUrl('fbmc');
    expect(url).toBe('http://localhost:5173/fbmc');
  });
});
