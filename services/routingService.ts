export type SubdomainType = 'root' | 'www' | 'app' | 'unknown';

export interface RouteContext {
  subdomain: SubdomainType;
  pathname: string;
  search: string;
  hash: string;
  isFormSlug: boolean;
  formSlug: string | null;
}

const RESERVED_FORM_SLUGS = ['api', 'admin', 'assets', 'static', 'public', '_next', 'favicon.ico', 'qr', 'embed'];

export function isValidPublicFormSlug(slug: string): boolean {
  if (!slug) return false;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  return !RESERVED_FORM_SLUGS.includes(slug.toLowerCase());
}

export function getPublicFormSlugFromPath(pathname: string): string | null {
  const cleanPath = pathname.substring(1).replace(/\/$/, '');
  if (!cleanPath || cleanPath.includes('/')) return null;
  return isValidPublicFormSlug(cleanPath) ? cleanPath : null;
}

export function getEmbedFormSlugFromPath(pathname: string): string | null {
  const cleanPath = pathname.replace(/^\/+/, '').replace(/\/$/, '');
  const [, slug, ...rest] = cleanPath.split('/');
  if (!cleanPath.startsWith('embed/') || !slug || rest.length > 0) return null;
  return isValidPublicFormSlug(slug) ? slug : null;
}

export function getSubdomainType(hostname: string): SubdomainType {
  // Local development: treat localhost as www by default, with optional ?subdomain overrides
  if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
    try {
      const params = new URLSearchParams(window.location.search);
      const sub = params.get('subdomain');
      if (sub === 'app') return 'app';
      if (sub === 'www') return 'www';
      return 'www';
    } catch {
      return 'www';
    }
  }

  if (hostname.startsWith('app.')) return 'app';
  if (hostname.startsWith('www.')) return 'www';

  const parts = hostname.split('.');
  if (parts.length === 2) {
    // e.g., signflow.ink
    return 'root';
  }

  return 'unknown';
}

export function getRouteContext(): RouteContext {
  const { hostname, pathname, search, hash } = window.location;
  const subdomain = getSubdomainType(hostname);

  const formSlug = getPublicFormSlugFromPath(pathname) || getEmbedFormSlugFromPath(pathname);
  const isFormSlug = Boolean(formSlug);

  return {
    subdomain,
    pathname,
    search,
    hash,
    isFormSlug,
    formSlug,
  };
}

export function buildFormUrl(slug: string): string {
  const { protocol, hostname, port } = window.location;

  // Local dev: keep current host/port
  if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
    const base = `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    return `${base}/${slug}`;
  }

  // Strip leading app./www. to get bare domain
  const baseDomain = hostname.replace(/^(www\.|app\.)/, '');
  return `${protocol}//www.${baseDomain}/${slug}`;
}
