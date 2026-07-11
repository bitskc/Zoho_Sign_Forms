
import React, { useState, useEffect, useRef } from 'react';
import { ViewMode, FormDefinition, SignerData, UserCredentials, SubscriptionPlan } from './types';
import Header from './components/Header';
import QRCodeModal from './components/QRCodeModal';
import { triggerZohoSignTemplate, testZohoConnection, fetchTemplateRoles, TemplateRole } from './services/zohoService';
import { supabase } from './services/supabaseClient';
import { getRouteContext, buildFormUrl } from './services/routingService';
import { validateContrast, validateAltText, KeyCodes, handleEnterOrSpace, getRelativeLuminance } from './utils/accessibility';


// Reserved slugs that cannot be used for forms
const RESERVED_SLUGS = ['api', 'admin', 'assets', 'static', 'public', '_next', 'favicon.ico', 'qr', 'embed', 'guides'];

// Validate slug format and check against reserved words
const isValidSlug = (slug: string): boolean => {
  if (!slug || slug.length === 0) return false;
  // Only allow alphanumeric characters and hyphens
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) return false;
  // Check against reserved words
  if (RESERVED_SLUGS.includes(slug.toLowerCase())) return false;
  return true;
};

// Convert slug to display title (e.g., "fbmc-short-application" -> "FBMC Short Application")
const slugToTitle = (slug: string): string => {
  return slug
    .split('-')
    .map(word => {
      // Keep common acronyms uppercase
      if (word.length <= 4 && /^[a-z]+$/.test(word)) {
        const upper = word.toUpperCase();
        // Common acronyms that should stay uppercase
        if (['FBMC', 'LLC', 'INC', 'USA', 'FAQ', 'PDF', 'API'].includes(upper)) {
          return upper;
        }
      }
      // Title case for regular words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

// Extend window for ZohoSign SDK
declare global {
  interface Window {
    ZohoSign: any;
  }
}

const App: React.FC = () => {
  const routeContext = getRouteContext();
  // Destructure to primitives so useEffect dep arrays get stable scalar values
  // instead of a new object reference on every render.
  const { subdomain: routeSubdomain, isFormSlug: routeIsFormSlug, formSlug: routeFormSlug } = routeContext;

  // Compute BEFORE any hooks so all hooks below are always called unconditionally.
  // The actual redirect side-effect is moved to a useEffect further down (see UX-03).
  const isRootDomain = routeSubdomain === 'root';

  const getInitialView = () => {
    const hash = window.location.hash || '';
    const path = window.location.pathname || '/';
    const hostname = window.location.hostname;
    
    // Check for path-based form URLs (e.g., /formslug)
    if (path !== '/' && !path.startsWith('/api') && !path.startsWith('/qr/')) {
      return ViewMode.PUBLIC_FORM;
    }
    
    // Check for hash-based admin routes
    if (hash.startsWith('#/admin/form/')) {
      return ViewMode.FORM_DETAILS;
    } else if (hash.startsWith('#/admin')) {
      return ViewMode.ADMIN_LOGIN;
    }
    
    // If on app subdomain and no hash, redirect to admin
    if (hostname.startsWith('app.') && hash === '' && path === '/') {
      window.location.hash = '#/admin';
      return ViewMode.ADMIN_LOGIN;
    }
    
    return ViewMode.LANDING;
  };

  // Determine if this is a public form page (for faster loading)
  const isPublicFormPage = () => {
    const path = window.location.pathname || '/';
    return path !== '/' && !path.startsWith('/api') && !path.startsWith('/qr/');
  };
  
  // Determine if we should wait for auth before rendering (only for admin pages)
  const shouldWaitForAuth = () => {
    const hash = window.location.hash || '';
    // Only admin pages need to wait for auth
    return hash.startsWith('#/admin');
  };
  
  const [view, setView] = useState<ViewMode | null>(isRootDomain ? null : getInitialView());
  // Landing pages and public forms render immediately; only admin pages wait for auth
  const [isRouteResolved, setIsRouteResolved] = useState(isRootDomain ? false : !shouldWaitForAuth());
  const [isFormLoading, setIsFormLoading] = useState(isRootDomain ? false : isPublicFormPage());
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [auth, setAuth] = useState<{username: string; password: string} | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentForm, setCurrentForm] = useState<FormDefinition | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{requestId: string, signingUrl?: string} | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  // Test/Helper states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{success: boolean, message: string, hint?: string} | null>(null);

  // Form editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [roleName, setRoleName] = useState('Signer 1');
  const [apiDomain, setApiDomain] = useState('https://sign.zoho.com');
  const [slug, setSlug] = useState('');

  // User-level Zoho credentials (secrets are never held in state after P1-03)
  const [credClientId, setCredClientId] = useState('');
  // credNewClientSecret / credNewRefreshToken: only populated when user actively wants to set/replace
  const [credNewClientSecret, setCredNewClientSecret] = useState('');
  const [credNewRefreshToken, setCredNewRefreshToken] = useState('');
  const [credApiDomain, setCredApiDomain] = useState('https://sign.zoho.com');
  const [credHasClientSecret, setCredHasClientSecret] = useState(false);
  const [credHasRefreshToken, setCredHasRefreshToken] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  const [subscription, setSubscription] = useState<SubscriptionPlan | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  
  // QR Code Modal state
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalForm, setQrModalForm] = useState<FormDefinition | null>(null);
  
  // Form Details page state
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<'settings' | 'landing' | 'signers' | 'embed' | 'qr' | 'analytics'>('settings');
  
  // Landing page editor state
  const [landingHeadline, setLandingHeadline] = useState('');
  const [landingDescription, setLandingDescription] = useState('');
  const [landingLogoUrl, setLandingLogoUrl] = useState('');
  const [landingPrimaryColor, setLandingPrimaryColor] = useState('#3B82F6');
  const [landingBackgroundColor, setLandingBackgroundColor] = useState('#F8FAFC');
  const [landingCardColor, setLandingCardColor] = useState('#FFFFFF');
  const [landingButtonText, setLandingButtonText] = useState('Sign Now');
  const [landingCompanyName, setLandingCompanyName] = useState('');
  const [landingContactEmail, setLandingContactEmail] = useState('');
  const [landingContactPhone, setLandingContactPhone] = useState('');
  const [landingFooterText, setLandingFooterText] = useState('');
  const [landingShowPoweredBy, setLandingShowPoweredBy] = useState(true);
  
  // Accessibility state
  const [landingLogoAlt, setLandingLogoAlt] = useState('');
  const [contrastWarning, setContrastWarning] = useState<string | null>(null);
  const [altTextError, setAltTextError] = useState<string | null>(null);

  // Signers & Delivery editor state
  // templateRoles: roles fetched live from the Zoho template (with action type + isPublic flag).
  // signerRoles: the admin-edited per-role config (recipient + delivery mode) for non-public roles.
  // signerNotes: optional override for the Zoho request notes.
  const [templateRoles, setTemplateRoles] = useState<TemplateRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [signerRoles, setSignerRoles] = useState<Record<string, { recipientName: string; recipientEmail: string; deliveryMode: 'embedded' | 'email' }>>({});
  const [signerNotes, setSignerNotes] = useState('');
  
  // QR Code and Analytics states (legacy - keeping for compatibility)
  const [qrCodes, setQrCodes] = useState<Map<string, string>>(new Map());
  const [analytics, setAnalytics] = useState<Map<string, any>>(new Map());
  const [loadingQR, setLoadingQR] = useState<Set<string>>(new Set());
  const [loadingAnalytics, setLoadingAnalytics] = useState<Set<string>>(new Set());
  const [analyticsTimeWindow, setAnalyticsTimeWindow] = useState<'day' | 'week' | 'month' | 'all'>('week');

  // UX-01: Inline delete confirmation and copy-link feedback (replaces confirm() / alert())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedEmbedId, setCopiedEmbedId] = useState<string | null>(null);

  
  // Debounce flags to prevent infinite retry loops
  const [credentialsFetchAttempted, setCredentialsFetchAttempted] = useState(false);
  const [subscriptionFetchAttempted, setSubscriptionFetchAttempted] = useState(false);
  const [formsFetchAttempted, setFormsFetchAttempted] = useState(false);
  
  // Use refs for public form fetch tracking to avoid re-render loops
  const fetchingFormBySlugRef = useRef(false);
  const lastFetchedSlugRef = useRef<string | null>(null);
  const analyticsTrackedRef = useRef<Set<string>>(new Set());

  // Fetch analytics for a form
  const fetchAnalytics = async (formId: string, window: string = analyticsTimeWindow) => {
    if (!sessionToken) return;
    
    // Prevent duplicate requests
    if (loadingAnalytics.has(formId)) return;
    
    setLoadingAnalytics(prev => new Set(prev).add(formId));
    
    try {
      const res = await fetch(`/api/analytics?formId=${formId}&window=${window}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setAnalytics(prev => new Map(prev).set(formId, data));
      } else if (res.status === 404) {
        // Form not found - set empty analytics
        setAnalytics(prev => new Map(prev).set(formId, {
          timeWindow: window,
          summary: { totalVisits: 0, totalSubmissions: 0, conversionRate: 0 },
          recentEvents: []
        }));
      }
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
      // Set empty analytics on error
      setAnalytics(prev => new Map(prev).set(formId, {
        timeWindow: window,
        summary: { totalVisits: 0, totalSubmissions: 0, conversionRate: 0 },
        recentEvents: []
      }));
    } finally {
      setLoadingAnalytics(prev => {
        const newSet = new Set(prev);
        newSet.delete(formId);
        return newSet;
      });
    }
  };

  // Fetch the roles defined in a Zoho Sign template so the admin can configure
  // signers/delivery per role. Merges any saved signer_config into the editor.
  const loadTemplateRoles = async (form: FormDefinition) => {
    if (!sessionToken || !form.id) return;
    setLoadingRoles(true);
    try {
      const result = await fetchTemplateRoles(form.id, sessionToken);
      if (result.success && result.roles) {
        setTemplateRoles(result.roles);
        // Seed editor state from saved config (non-public roles only).
        const saved = form.signerConfig;
        const seeded: Record<string, { recipientName: string; recipientEmail: string; deliveryMode: 'embedded' | 'email' }> = {};
        for (const role of result.roles) {
          if (role.isPublic) continue;
          const cfg = saved?.roles?.find(r => r.role.toLowerCase() === role.role.toLowerCase());
          seeded[role.role] = {
            recipientName: cfg?.recipientName || '',
            recipientEmail: cfg?.recipientEmail || '',
            deliveryMode: cfg?.deliveryMode || 'email',
          };
        }
        setSignerRoles(seeded);
        setSignerNotes(saved?.notes || '');
      } else if (result.error) {
        setError(result.error);
      }
    } finally {
      setLoadingRoles(false);
    }
  };

  const fetchForms = async (token: string) => {
    if (formsFetchAttempted) {
      return;
    }
    
    setFormsFetchAttempted(true);
    
    try {
      const res = await fetch('/api/forms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          console.warn('Forms API unauthorized (401) - session may have expired');
          // 401 is definitive — do not retry until the user re-authenticates.
        } else {
          // Transient error (5xx, network hiccup, etc.) — allow a future retry.
          console.warn(`Forms API error (${res.status}) - will allow retry`);
          setFormsFetchAttempted(false);
        }
        setForms([]);
        return;
      }
      const data = await res.json();
      setForms(data || []);

      // Only hydrate known QR codes from existing form payload.
      // Do not auto-generate or auto-fetch missing QR codes on login/dashboard load.
      if (data && data.length > 0) {
        setQrCodes(prev => {
          const merged = new Map(prev);
          for (const form of data) {
            if (form?.id && form.qrCodeData) {
              merged.set(form.id, form.qrCodeData);
            }
          }
          return merged;
        });
      }
    } catch (e) {
      console.error('fetch forms error', e);
      // Network failure/timeout can be transient — allow a future retry.
      setFormsFetchAttempted(false);
      setForms([]);
    }
  };

  const fetchFormBySlug = async (slugVal: string) => {
    // Use refs for guards to avoid stale closures and re-render loops
    if (fetchingFormBySlugRef.current) {
      return; // Prevent concurrent fetches
    }
    
    if (lastFetchedSlugRef.current === slugVal) {
      setIsFormLoading(false);
      return; // Already fetched this slug
    }
    
    fetchingFormBySlugRef.current = true;
    setIsFormLoading(true);
    
    try {
      const res = await fetch(`/api/forms?slug=${encodeURIComponent(slugVal)}`);
      if (res.status === 429) {
        // Rate limited - show a message instead of 404
        setError('Too many requests. Please try again later.');
        setCurrentForm(null);
        setView(ViewMode.NOT_FOUND);
        return;
      }
      if (!res.ok) {
        setCurrentForm(null);
        setView(ViewMode.NOT_FOUND);
        return;
      }
      const data = await res.json();
      // Only mark as fetched after successful fetch
      lastFetchedSlugRef.current = slugVal;
      setCurrentForm(data);
      setView(ViewMode.PUBLIC_FORM);
      // Update browser history for proper back/forward navigation
      if (window.location.pathname !== `/${slugVal}`) {
        window.history.pushState({ slug: slugVal }, '', `/${slugVal}`);
      }
    } catch {
      setCurrentForm(null);
      setView(ViewMode.NOT_FOUND);
    } finally {
      fetchingFormBySlugRef.current = false;
      setIsFormLoading(false);
    }
  };

  const fetchCredentials = async (token: string) => {
    if (credentialsFetchAttempted) {
      return;
    }
    
    setCredentialsFetchAttempted(true);
    
    try {
      const res = await fetch('/api/credentials', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: UserCredentials = await res.json();
        setCredClientId(data.clientId || '');
        setCredHasClientSecret(data.hasClientSecret || false);
        setCredHasRefreshToken(data.hasRefreshToken || false);
        setCredApiDomain(data.apiDomain || 'https://sign.zoho.com');
        // Clear any previously entered "new value" inputs when refreshing from server
        setCredNewClientSecret('');
        setCredNewRefreshToken('');
      } else if (res.status === 404) {
        // 404 is expected - API endpoint doesn't exist yet
        console.warn('Credentials API not implemented (404)');
      }
    } catch (e) {
      // Silently handle network errors to prevent console spam
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        // Network error - likely API not available
        console.warn('Credentials API unavailable - using defaults');
      } else {
        console.error('fetch credentials error', e);
      }
    } finally {
      setCredentialsLoaded(true);
    }
  };

  const saveCredentials = async () => {
    if (!sessionToken) return;
    const payload = {
      clientId: credClientId.trim(),
      // Only include secret/token if user explicitly entered a new value; omitting them
      // tells the server to preserve the existing stored value (never overwrite with blank)
      ...(credNewClientSecret.trim() ? { clientSecret: credNewClientSecret.trim() } : {}),
      ...(credNewRefreshToken.trim() ? { refreshToken: credNewRefreshToken.trim() } : {}),
      apiDomain: credApiDomain.trim() || 'https://sign.zoho.com'
    };
    const res = await fetch('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const msg = await res.text();
      setError(`Save credentials failed: ${msg}`);
      return;
    }
    // Reset debounce flag and refetch
    setCredentialsFetchAttempted(false);
    await fetchCredentials(sessionToken);
  };

  const fetchSubscription = async (token: string) => {
    if (subscriptionFetchAttempted) {
      return;
    }
    
    setSubscriptionFetchAttempted(true);
    
    try {
      const res = await fetch('/api/subscription', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: SubscriptionPlan = await res.json();
        setSubscription(data);
      } else if (res.status === 404) {
        // 404 is expected - API endpoint doesn't exist yet
        console.warn('Subscription API not implemented (404)');
      }
    } catch (e) {
      // Silently handle network errors to prevent console spam
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        // Network error - likely API not available
        console.warn('Subscription API unavailable - using defaults');
      } else {
        console.error('fetch subscription error', e);
      }
    } finally {
      setSubscriptionLoaded(true);
    }
  };

  const saveSubscription = async (plan: string, status: string, seats?: number) => {
    if (!sessionToken) return;
    const res = await fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ plan, status, seats })
    });
    if (!res.ok) {
      const msg = await res.text();
      setError(`Save subscription failed: ${msg}`);
      return;
    }
    // Reset debounce flag and refetch
    setSubscriptionFetchAttempted(false);
    await fetchSubscription(sessionToken);
  };

  useEffect(() => {
    const resolveRoute = () => {
      // Don't resolve routes until auth check is complete to prevent flickering
      if (!isRouteResolved) {
        return;
      }
      
      const hash = window.location.hash || '';
      const path = window.location.pathname || '/';

      // Handle path-based form URLs (e.g., /formslug)
      if (path !== '/' && !path.startsWith('/api')) {
        const slugVal = path.substring(1).replace(/\/$/, '');
        
        // Validate slug format
        if (!isValidSlug(slugVal)) {
          setCurrentForm(null);
          setView(ViewMode.NOT_FOUND);
          return;
        }
        
        // For public forms, fetch by slug using ref-based guards
        // The guards are in fetchFormBySlug itself, so just call it
        if (slugVal && isRouteResolved) {
          fetchFormBySlug(slugVal);
        } else if (!isRouteResolved) {
          // Wait for initial load to complete
          setView(ViewMode.PUBLIC_FORM);
        }
        return;
      } else if (hash.startsWith('#/admin/signup')) {
        setAuthMode('signup');
        setView(ViewMode.ADMIN_LOGIN);
        window.location.hash = '#/admin/signup';
      } else if (hash.startsWith('#/admin/login') || hash === '#/admin') {
        setAuthMode('login');
        setView(ViewMode.ADMIN_LOGIN);
        window.location.hash = '#/admin/login';
      } else if (hash.startsWith('#/admin/dashboard')) {
        setView(ViewMode.ADMIN_DASHBOARD);
      } else if (hash.startsWith('#/admin/settings')) {
        setView(ViewMode.ADMIN_SETTINGS);
      } else if (hash.startsWith('#/admin/form/')) {
        // Extract form ID from hash (e.g., #/admin/form/123 -> 123)
        const formId = hash.split('/').pop();
        const form = forms.find(f => f.id === formId);
        if (form && sessionToken) {
          // Load form details without calling openFormDetails to avoid recursion
          setSelectedFormId(formId);
          setDetailsTab('settings');
          
          // Load basic form settings into editor
          setEditingId(form.id);
          setFormName(form.name);
          setTemplateId(form.templateId);
          setRoleName(form.roleName);
          setApiDomain(form.apiDomain || 'https://sign.zoho.com');
          setSlug(form.slug);
          
          // Load landing page config
          const lc = form.landingConfig || {};
          setLandingHeadline(lc.headline || '');
          setLandingDescription(lc.description || '');
          setLandingLogoUrl(lc.logoUrl || '');
          setLandingLogoAlt(lc.logoAlt || '');
          setLandingPrimaryColor(lc.theme?.primaryColor || '#3B82F6');
          setLandingBackgroundColor(lc.theme?.backgroundColor || '#F8FAFC');
          setLandingCardColor(lc.theme?.cardColor || '#FFFFFF');
          setLandingButtonText(lc.buttonText || 'Sign Now');
          setLandingCompanyName(lc.contact?.companyName || '');
          setLandingContactEmail(lc.contact?.email || '');
          setLandingContactPhone(lc.contact?.phone || '');
          setLandingFooterText(lc.footerText || '');
          setLandingShowPoweredBy(lc.showPoweredBy !== false);
          
          setError(null);
          setView(ViewMode.FORM_DETAILS);
        } else {
          // Form not found or not authenticated, go to dashboard
          setView(ViewMode.ADMIN_DASHBOARD);
          window.location.hash = '#/admin/dashboard';
        }
      } else {
        if (hash !== '') {
          window.location.hash = '';
        }
        setView(ViewMode.LANDING);
      }
    };

    window.addEventListener('hashchange', resolveRoute);
    window.addEventListener('popstate', resolveRoute);
    
    const init = async () => {
      const path = window.location.pathname || '/';
      const hash = window.location.hash || '';
      const isPublicForm = path !== '/' && !path.startsWith('/api') && !path.startsWith('/qr/');
      const isAdminPage = hash.startsWith('#/admin');
      const isLandingPage = path === '/' && !isAdminPage;
      
      // For public form pages, fetch the form immediately without waiting for auth
      if (isPublicForm) {
        const slugVal = path.substring(1).replace(/\/$/, '');
        if (isValidSlug(slugVal)) {
          // Start fetching the form right away
          fetchFormBySlug(slugVal);
        } else {
          setCurrentForm(null);
          setView(ViewMode.NOT_FOUND);
          setIsFormLoading(false);
        }
        
        // Auth check runs in background for public forms (non-blocking)
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            setSessionToken(data.session.access_token);
            setUserId(data.session.user.id);
            setAuth({ username: data.session.user.email || '', password: '' });
          }
        });
        return;
      }
      
      // For landing page, auth check runs in background (non-blocking)
      if (isLandingPage) {
        supabase.auth.getSession().then(async ({ data }) => {
          if (data.session) {
            setSessionToken(data.session.access_token);
            setUserId(data.session.user.id);
            setAuth({ username: data.session.user.email || '', password: '' });
            
            // Fetch admin data in background for logged-in users
            await Promise.all([
              fetchForms(data.session.access_token),
              fetchCredentials(data.session.access_token),
              fetchSubscription(data.session.access_token)
            ]);
          }
        });
        return;
      }
      
      // For admin pages, wait for auth check before rendering
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionToken(data.session.access_token);
        setUserId(data.session.user.id);
        setAuth({ username: data.session.user.email || '', password: '' });
        
        await Promise.all([
          fetchForms(data.session.access_token),
          fetchCredentials(data.session.access_token),
          fetchSubscription(data.session.access_token)
        ]);
      }
      setIsRouteResolved(true);
      // Now that auth check is complete, resolve the route
      resolveRoute();
    };
    init();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        setSessionToken(session.access_token);
        setUserId(session.user.id);
        setAuth({ username: session.user.email || '', password: '' });
        await Promise.all([
          fetchForms(session.access_token),
          fetchCredentials(session.access_token),
          fetchSubscription(session.access_token)
        ]);
      } else {
        // User logged out - clear all state
        setSessionToken(null);
        setUserId(null);
        setAuth(null);
        setForms([]);
        // Reset debounce flags to allow fresh fetches on next login
        setFormsFetchAttempted(false);
        setCredentialsFetchAttempted(false);
        setSubscriptionFetchAttempted(false);
        
        const hash = window.location.hash;
        const path = window.location.pathname || '/';
        
        // Allow access to login/signup pages, but redirect dashboard/settings
        if (hash.startsWith('#/admin/dashboard') || hash.startsWith('#/admin/settings')) {
          window.location.hash = '#/admin/login';
          setView(ViewMode.ADMIN_LOGIN);
        } else if (hash.startsWith('#/admin/login') || hash.startsWith('#/admin/signup') || hash === '#/admin') {
          // Allow login/signup pages when not authenticated - don't change view
          return;
        } else if (path !== '/' && !path.startsWith('/api')) {
          setView(ViewMode.PUBLIC_FORM);
        } else if (hash === '' || hash === '/') {
          // Only set to landing if we're actually on the root
          setView(ViewMode.LANDING);
        }
      }
    });
    return () => {
      window.removeEventListener('hashchange', resolveRoute);
      window.removeEventListener('popstate', resolveRoute);
      listener?.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteResolved]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: usernameInput,
          password: passwordInput
        });
        if (error) {
          setError(error.message || 'Sign up failed');
          setLoading(false);
          return;
        }
        if (!data.session) {
          setError('Check your email to confirm your account, then log in.');
          setLoading(false);
          setAuthMode('login');
          return;
        }
        setSessionToken(data.session.access_token);
        setUserId(data.session.user.id);
        setAuth({ username: usernameInput, password: '' });
        window.location.hash = '#/admin/dashboard';
        setView(ViewMode.ADMIN_DASHBOARD);
        await fetchForms(data.session.access_token);
        await fetchCredentials(data.session.access_token);
        await fetchSubscription(data.session.access_token);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: usernameInput,
          password: passwordInput
        });
        if (error || !data.session) {
          setError(error?.message || 'Login failed');
          setLoading(false);
          return;
        }
        setSessionToken(data.session.access_token);
        setUserId(data.session.user.id);
        setAuth({ username: usernameInput, password: '' });
        window.location.hash = '#/admin/dashboard';
        setView(ViewMode.ADMIN_DASHBOARD);
        await fetchForms(data.session.access_token);
        await fetchCredentials(data.session.access_token);
        await fetchSubscription(data.session.access_token);
      }
    } catch (err: any) {
      console.error('Auth error', err);
      setError(err?.message || 'Network error (failed to reach Supabase)');
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setEditingId(null);
    setFormName('');
    setTemplateId('');
    setRoleName('Signer 1');
    setApiDomain('https://sign.zoho.com');
    setSlug('');
    setError(null);
    // Clear landing page customization fields
    setLandingHeadline('');
    setLandingDescription('');
    setLandingLogoUrl('');
    setLandingLogoAlt('');
    setLandingPrimaryColor('#3B82F6');
    setLandingBackgroundColor('#F8FAFC');
    setLandingCardColor('#FFFFFF');
    setLandingButtonText('Sign Now');
    setLandingCompanyName('');
    setLandingContactEmail('');
    setLandingContactPhone('');
    setLandingFooterText('');
    setLandingShowPoweredBy(true);
    // Clear accessibility errors
    setContrastWarning(null);
    setAltTextError(null);
    // Clear signers & delivery state
    setTemplateRoles([]);
    setSignerRoles({});
    setSignerNotes('');
  };

  const startEdit = (form: FormDefinition) => {
    setEditingId(form.id);
    setFormName(form.name);
    setTemplateId(form.templateId);
    setRoleName(form.roleName);
    setApiDomain(form.apiDomain || 'https://sign.zoho.com');
    setSlug(form.slug);
    setError(null);
  };

  // Open the form details page with all settings loaded
  const openFormDetails = (form: FormDefinition) => {
    setSelectedFormId(form.id);
    setDetailsTab('settings');
    
    // Load basic form settings into editor
    setEditingId(form.id);
    setFormName(form.name);
    setTemplateId(form.templateId);
    setRoleName(form.roleName);
    setApiDomain(form.apiDomain || 'https://sign.zoho.com');
    setSlug(form.slug);
    
    // Load landing page config
    const lc = form.landingConfig || {};
    setLandingHeadline(lc.headline || '');
    setLandingDescription(lc.description || '');
    setLandingLogoUrl(lc.logoUrl || '');
    setLandingLogoAlt(lc.logoAlt || '');
    setLandingPrimaryColor(lc.theme?.primaryColor || '#3B82F6');
    setLandingBackgroundColor(lc.theme?.backgroundColor || '#F8FAFC');
    setLandingCardColor(lc.theme?.cardColor || '#FFFFFF');
    setLandingButtonText(lc.buttonText || 'Sign Now');
    setLandingCompanyName(lc.contact?.companyName || '');
    setLandingContactEmail(lc.contact?.email || '');
    setLandingContactPhone(lc.contact?.phone || '');
    setLandingFooterText(lc.footerText || '');
    setLandingShowPoweredBy(lc.showPoweredBy !== false);

    // Reset signers & delivery state; roles are loaded on-demand when the tab is opened.
    setTemplateRoles([]);
    setSignerNotes(form.signerConfig?.notes || '');
    const seeded: Record<string, { recipientName: string; recipientEmail: string; deliveryMode: 'embedded' | 'email' }> = {};
    for (const r of form.signerConfig?.roles || []) {
      if (r.isPublic) continue;
      seeded[r.role] = {
        recipientName: r.recipientName || '',
        recipientEmail: r.recipientEmail || '',
        deliveryMode: r.deliveryMode || 'email',
      };
    }
    setSignerRoles(seeded);

    setError(null);
    setView(ViewMode.FORM_DETAILS);
    window.location.hash = `#/admin/form/${form.id}`;
  };

  // Get the currently selected form object
  const getSelectedForm = (): FormDefinition | undefined => {
    return forms.find(f => f.id === selectedFormId);
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      setError('Not authenticated');
      return;
    }
    
    if (loading) {
      return; // Prevent multiple submissions
    }
    
    // Validate accessibility requirements
    if (landingLogoUrl && !landingLogoAlt) {
      setError('Please provide descriptive alt text for your logo (required for accessibility)');
      setDetailsTab('landing');
      return;
    }
    
    if (landingLogoAlt) {
      const altValidation = validateAltText(landingLogoAlt);
      if (!altValidation.valid) {
        setError(`Logo alt text issue: ${altValidation.errors[0]}`);
        setDetailsTab('landing');
        return;
      }
    }
    
    // Note: Contrast warnings are shown in real-time in the UI
    // We allow saving even with contrast issues, but users are warned during editing
    
    setLoading(true);
    
    // Validate slug before saving
    const trimmedSlug = slug.trim().toLowerCase();
    if (!isValidSlug(trimmedSlug)) {
      setError('Invalid slug. Use only lowercase letters, numbers, and hyphens. Avoid reserved words like "api", "admin", etc.');
      setLoading(false);
      return;
    }
    
    // Check for duplicate slugs (excluding current form if editing)
    const duplicateSlug = forms.find(f => f.slug === trimmedSlug && f.id !== editingId);
    if (duplicateSlug) {
      setError(`Slug "${trimmedSlug}" is already in use. Please choose a different slug.`);
      setLoading(false);
      return;
    }
    
    // P2-03: For new forms, omit id — server generates it via gen_random_uuid().
    // For updates (editingId is set), include id so the server routes to UPDATE path.
    // Build signer/delivery config from the editor when roles have been loaded;
    // otherwise preserve any existing config so saving from another tab doesn't wipe it.
    const signerConfig = templateRoles.length > 0
      ? {
          notes: signerNotes.trim() || undefined,
          roles: templateRoles
            .filter(r => !r.isPublic)
            .map(r => {
              const ed = signerRoles[r.role] || { recipientName: '', recipientEmail: '', deliveryMode: 'email' as const };
              return {
                role: r.role,
                actionType: r.actionType,
                recipientName: ed.recipientName.trim() || undefined,
                recipientEmail: ed.recipientEmail.trim() || undefined,
                deliveryMode: ed.deliveryMode,
                isPublic: false,
              };
            }),
        }
      : currentForm?.signerConfig;

    const formDef: FormDefinition = {
      ...(editingId ? { id: editingId } : {}),
      name: formName.trim(),
      slug: trimmedSlug,
      templateId: templateId.trim(),
      roleName: roleName.trim(),
      apiDomain: apiDomain.trim(),
      // userId and accessToken removed — server resolves ownership from JWT (P1-02 / P3-04)
      createdAt: editingId ? (forms.find(f => f.id === editingId)?.createdAt || Date.now()) : Date.now(),
      signerConfig,
      // Include landing config if any values are set
      landingConfig: (landingHeadline || landingDescription || landingLogoUrl || landingLogoAlt || landingCompanyName || landingContactEmail || landingContactPhone || landingFooterText || landingPrimaryColor !== '#3B82F6' || landingBackgroundColor !== '#F8FAFC' || landingCardColor !== '#FFFFFF' || landingButtonText !== 'Sign Now' || !landingShowPoweredBy) ? {
        headline: landingHeadline || undefined,
        description: landingDescription || undefined,
        logoUrl: landingLogoUrl || undefined,
        logoAlt: landingLogoAlt || undefined,
        theme: (landingPrimaryColor !== '#3B82F6' || landingBackgroundColor !== '#F8FAFC' || landingCardColor !== '#FFFFFF') ? {
          primaryColor: landingPrimaryColor !== '#3B82F6' ? landingPrimaryColor : undefined,
          backgroundColor: landingBackgroundColor, // Always save to ensure it propagates
          cardColor: landingCardColor !== '#FFFFFF' ? landingCardColor : undefined
        } : undefined,
        buttonText: landingButtonText !== 'Sign Now' ? landingButtonText : undefined,
        contact: (landingCompanyName || landingContactEmail || landingContactPhone) ? {
          companyName: landingCompanyName || undefined,
          email: landingContactEmail || undefined,
          phone: landingContactPhone || undefined
        } : undefined,
        footerText: landingFooterText || undefined,
        showPoweredBy: landingShowPoweredBy
      } : undefined
    };
    
    const res = await fetch('/api/forms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify(formDef)
    });
    
    if (!res.ok) {
      const msg = await res.text();
      if (res.status === 404) {
        setError('Forms API not implemented yet. Please contact administrator.');
      } else {
        setError(`Save failed: ${msg}`);
      }
      setLoading(false);
      return;
    }
    const saved = await res.json();
    // P2-03: For new forms, saved.id comes from the server (DB-generated UUID).
    // Update editingId to the server-assigned id so subsequent edits go to UPDATE path.
    if (!editingId && saved.id) {
      setEditingId(saved.id);
    }
    let updated = editingId ? forms.map(f => f.id === editingId ? saved : f) : [...forms, saved];
    setForms(updated);

    // Determine if we're currently viewing this form's details
    const isViewingSavedForm = selectedFormId === (editingId || saved.id);

    // If we're viewing this form's details, update currentForm and the editor state
    if (isViewingSavedForm) {
      setCurrentForm(saved);
      const lc = saved.landingConfig || {};

      // Ensure editor stays bound to the saved form and reflect latest values
      setEditingId(saved.id);
      setFormName(saved.name || '');
      setTemplateId(saved.templateId || '');
      setRoleName(saved.roleName || 'Signer 1');
      setApiDomain(saved.apiDomain || 'https://sign.zoho.com');
      setSlug(saved.slug || '');

      setLandingHeadline(lc.headline || '');
      setLandingDescription(lc.description || '');
      setLandingLogoUrl(lc.logoUrl || '');
      setLandingLogoAlt(lc.logoAlt || '');
      setLandingPrimaryColor(lc.theme?.primaryColor || '#3B82F6');
      setLandingBackgroundColor(lc.theme?.backgroundColor || '#F8FAFC');
      setLandingCardColor(lc.theme?.cardColor || '#FFFFFF');
      setLandingButtonText(lc.buttonText || 'Sign Now');
      setLandingCompanyName(lc.contact?.companyName || '');
      setLandingContactEmail(lc.contact?.email || '');
      setLandingContactPhone(lc.contact?.phone || '');
      setLandingFooterText(lc.footerText || '');
      setLandingShowPoweredBy(lc.showPoweredBy !== false);

      // Refresh signers & delivery editor from the saved config. Roles list is
      // kept as-is (already loaded); only the per-role edits are re-seeded.
      setSignerNotes(saved.signerConfig?.notes || '');
      const reseeded: Record<string, { recipientName: string; recipientEmail: string; deliveryMode: 'embedded' | 'email' }> = {};
      for (const r of saved.signerConfig?.roles || []) {
        if (r.isPublic) continue;
        reseeded[r.role] = {
          recipientName: r.recipientName || '',
          recipientEmail: r.recipientEmail || '',
          deliveryMode: r.deliveryMode || 'email',
        };
      }
      setSignerRoles(reseeded);
    } else {
      // Not viewing the saved form's details in-place — clear the editor for a fresh state
      clearForm();
    }

    setLoading(false);

    // Only adjust the details tab if we're on this form's details view
    if (isViewingSavedForm) {
      setDetailsTab('landing'); // Stay on landing tab after save
    }
  };

  const deleteForm = async (id: string) => {
    if (!sessionToken) return;
    // First click: show inline confirmation; second click: execute deletion
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    setDeleteConfirmId(null);
    await fetch(`/api/forms?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const updated = forms.filter(f => f.id !== id);
    setForms(updated);
  };

  const runConnectionTest = async (form: FormDefinition) => {
    setTestingId(form.id);
    setTestResult(null);
    const res = await testZohoConnection(form, {
      clientId: credClientId,
      apiDomain: credApiDomain,
      // Credentials are loaded server-side from the database for this form's owner (P1-02/P1-03)
    });
    
    setTestResult({
      success: res.success,
      message: res.success ? `Success! Integration is live.` : res.error || "Connection Error",
      hint: !res.success ? "Check if your Template ID is correct and Role Name matches exactly." : undefined
    });
    setTestingId(null);
  };

  const handlePublicSubmit = async (signer: SignerData) => {
    if (!currentForm) return;
    setLoading(true);
    setError(null);
    
    // Track submit_start event
    trackAnalytics(currentForm.id, 'submit_start', { name: signer.name, email: signer.email });
    
    const res = await triggerZohoSignTemplate(currentForm, signer, false, {
      // Credentials are resolved server-side from the form's templateId (P1-02)
    });
    
    if (res.success) {
      // Track successful submission
      trackAnalytics(currentForm.id, 'submit_success', { name: signer.name, email: signer.email });
      
      if (res.signingUrl) {
        // Redirect user directly to the Zoho Sign form
        window.location.href = res.signingUrl;
        return; // Don't set loading to false, page is redirecting
      } else {
        // Embed token not available, user will receive email link
        setSuccessData({ requestId: res.requestId!, signingUrl: undefined });
      }
    } else {
      // Track failed submission
      trackAnalytics(currentForm.id, 'submit_error', { name: signer.name, email: signer.email, error: res.error });
      
      setError('We could not prepare this document. Please try again or contact the sender.');
    }
    setLoading(false);
  };

  const openZohoSign = (url: string) => {
    if (window.ZohoSign) {
      new window.ZohoSign().signDocument({ "signing_url": url });
    } else {
      window.open(url, '_blank');
    }
  };

  // Analytics tracking function - simplified, relies on caller to prevent duplicates
  const trackAnalytics = async (formId: string, eventType: 'visit' | 'submit_start' | 'submit_success' | 'submit_error', data?: { name?: string; email?: string; error?: string }) => {
    try {
      const payload = JSON.stringify({
        formId,
        eventType,
        visitorEmail: data?.email,
        visitorName: data?.name,
        referrer: document.referrer || undefined,
        userAgent: navigator.userAgent,
        metadata: data?.error ? { error: data.error } : undefined
      });

      if ('sendBeacon' in navigator) {
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon('/api/analytics', blob)) {
          return;
        }
      }

      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
    } catch (e) {
      console.warn('Analytics tracking failed:', e);
      // Don't block the user flow if analytics fails
    }
  };

  // Fetch QR code for a form
  const fetchQRCode = async (formId: string) => {
    if (!sessionToken) return;
    setLoadingQR(prev => new Set(prev).add(formId));
    
    try {
      const res = await fetch(`/api/qrcodes?formId=${formId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setQrCodes(prev => new Map(prev).set(formId, data.qrCodeData));
      } else if (res.status === 404) {
        // QR code doesn't exist, generate it
        await generateQRCode(formId);
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unable to load QR code' }));
        setError(`Failed to load QR code: ${errorData.error || res.status}`);
      }
    } catch (e) {
      console.error('Failed to fetch QR code:', e);
      setError('Failed to load QR code. Please try again.');
    } finally {
      setLoadingQR(prev => {
        const next = new Set(prev);
        next.delete(formId);
        return next;
      });
    }
  };

  // Generate QR code for a form
  const generateQRCode = async (formId: string) => {
    if (!sessionToken) return;
    setLoadingQR(prev => new Set(prev).add(formId));
    
    try {
      const res = await fetch('/api/qrcodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ formId, regenerate: false })
      });
      
      if (res.ok) {
        const data = await res.json();
        setQrCodes(prev => new Map(prev).set(formId, data.qrCodeData));
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('QR generation failed:', errorData);
        setError(`Failed to generate QR code: ${errorData.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to generate QR code:', e);
      setError('Failed to generate QR code. Please try again.');
    } finally {
      setLoadingQR(prev => {
        const next = new Set(prev);
        next.delete(formId);
        return next;
      });
    }
  };

  // Regenerate QR code for a form
  const regenerateQR = async (formId: string) => {
    if (!sessionToken) return;
    setLoadingQR(prev => new Set(prev).add(formId));
    
    try {
      const form = forms.find(f => f.id === formId);
      if (!form) return;
      
      const response = await fetch('/api/qrcodes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          formId: form.id,
          templateId: form.templateId,
          slug: form.slug || `form-${form.id}`,
          regenerate: true
        })
      });
      
      if (response.ok) {
        const qrResult = await response.json();
        setQrCodes(prev => new Map(prev).set(formId, qrResult.qrCodeData));
      } else {
        console.error('QR regeneration failed with status:', response.status);
        setError('Failed to regenerate QR code. Please try again.');
      }
    } catch (error) {
      console.error('Error regenerating QR code:', error);
      setError('Failed to regenerate QR code. Please try again.');
    } finally {
      setLoadingQR(prev => {
        const next = new Set(prev);
        next.delete(formId);
        return next;
      });
    }
  };

  const buildEmbedUrl = (slugValue: string) => {
    const formUrl = buildFormUrl(slugValue);
    const url = new URL(formUrl);
    url.pathname = `/embed/${slugValue}`;
    return url.toString();
  };

  const escapeHtmlAttribute = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const buildEmbedCode = (form: FormDefinition) => {
    const title = escapeHtmlAttribute(`${form.name} signing form`);
    const src = escapeHtmlAttribute(buildEmbedUrl(form.slug));
    return `<iframe src="${src}" title="${title}" width="100%" height="720" style="border:0;max-width:560px;width:100%;" loading="lazy" referrerpolicy="origin"></iframe>`;
  };

  const copyEmbedCode = async (form: FormDefinition) => {
    try {
      await navigator.clipboard.writeText(buildEmbedCode(form));
      setCopiedEmbedId(form.id || null);
      setError(null);
      setTimeout(() => setCopiedEmbedId(prev => prev === form.id ? null : prev), 2000);
    } catch {
      setCopiedEmbedId(null);
      setError('Could not copy embed code. Please select and copy it manually.');
    }
  };


  // UX-03: Root-domain redirect moved here from render body to avoid hooks-rules violation.
  // Runs once on mount; if isRootDomain is true, nothing else is rendered (see guard below).
  useEffect(() => {
    if (isRootDomain) {
      const hostnameParts = window.location.hostname.split('.').slice(-2);
      const baseDomain = hostnameParts.join('.');
      const targetUrl = `${window.location.protocol}//www.${baseDomain}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(targetUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If someone tries to access a form URL on the app subdomain, force redirect to canonical www URL
  useEffect(() => {
    if (routeSubdomain === 'app' && routeIsFormSlug && routeFormSlug) {
      const wwwUrl = buildFormUrl(routeFormSlug);
      window.location.replace(wwwUrl);
    }
  }, [routeSubdomain, routeIsFormSlug, routeFormSlug]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Track visit analytics when form is viewed - using ref to prevent duplicate tracking
  useEffect(() => {
    if (view === ViewMode.PUBLIC_FORM && currentForm?.id) {
      // Check if we've already tracked this form visit
      if (!analyticsTrackedRef.current.has(currentForm.id)) {
        analyticsTrackedRef.current.add(currentForm.id);
        trackAnalytics(currentForm.id, 'visit');
      }
    }
  }, [view, currentForm?.id]);

  // Analytics are loaded on-demand from the analytics tab.

  // UX-01: Clear armed delete confirmation if the user navigates away or changes view
  useEffect(() => {
    setDeleteConfirmId(null);
  }, [view]);

  // P4-05: Update document.title whenever the active view or current form changes
  useEffect(() => {
    const base = 'SignFlow Pro';
    if (view === ViewMode.PUBLIC_FORM && currentForm) {
      document.title = `${currentForm.name} | ${base}`;
    } else if (view === ViewMode.ADMIN_DASHBOARD) {
      document.title = `Dashboard | ${base}`;
    } else if (view === ViewMode.FORM_DETAILS && currentForm) {
      document.title = `${currentForm.name} – Settings | ${base}`;
    } else if (view === ViewMode.ADMIN_LOGIN) {
      document.title = `Sign In | ${base}`;
    } else if (view === ViewMode.NOT_FOUND) {
      document.title = `404 Not Found | ${base}`;
    } else {
      document.title = base;
    }
  }, [view, currentForm]);

  // UX-03: All hooks have been called. Now it is safe to bail out early for root-domain redirect.
  if (isRootDomain) return null;

  return (
    <div className={`min-h-screen font-sans ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Loading state for admin/landing pages (waiting for auth) */}
      {(!isRouteResolved || view === null) && view !== ViewMode.PUBLIC_FORM && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="motion-safe:animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`${darkMode ? 'text-slate-400' : 'text-slate-400'} font-bold text-lg`}>Loading...</p>
          </div>
        </div>
      )}

      {/* Public form loading spinner removed - now using optimistic rendering */}

      {isRouteResolved && view === ViewMode.LANDING && (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
          <Header isLoggedIn={!!sessionToken} onLoginClick={() => setView(ViewMode.ADMIN_LOGIN)} />
          
          {/* Hero Section */}
          <main className="max-w-6xl mx-auto px-6 pt-16 pb-24">
            <section className="grid lg:grid-cols-2 gap-14 items-center mb-32">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/10 border border-emerald-400/30 text-xs font-semibold uppercase tracking-wide">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  The $60/Year Alternative to Zoho Sign Enterprise
                </div>
                <div className="space-y-4">
                  <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                    Zoho Sign Enterprise Costs $275/User. You Don't Need It.
                  </h1>
                  <p className="text-xl text-emerald-400 font-semibold">
                    Shareable signing links and QR codes for Zoho Sign templates. No sales call. No enterprise contract. Just $60/year.
                  </p>
                  <p className="text-lg text-slate-300 leading-relaxed">
                    Zoho Sign Enterprise costs $275/user/year. But if all you need is a shareable link that anyone can click to sign your template — SignFlow Pro does exactly that for $60/year, full stop. No per-user fees. No Zoho account required for signers.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setView(ViewMode.ADMIN_LOGIN); }}
                    className="px-8 py-4 rounded-lg bg-emerald-500 text-slate-900 font-bold text-base hover:bg-emerald-400 shadow-lg hover:shadow-emerald-500/50 hover:translate-y-[-2px] transition-all"
                  >
                    Start Free Trial
                  </button>
                  <button
                    onClick={() => { window.location.hash = '#/admin/login'; setAuthMode('login'); setView(ViewMode.ADMIN_LOGIN); }}
                    className="px-8 py-4 rounded-lg border-2 border-white/30 text-white font-bold text-base hover:bg-white/10 hover:border-white/50 transition-all"
                  >
                    Sign In
                  </button>
                </div>
                <div className="flex items-center gap-6 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    <span>No credit card</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    <span>Setup in 5 minutes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    <span>Unlimited forms per account</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute -top-10 -left-10 h-32 w-32 bg-emerald-500/30 blur-3xl rounded-full"></div>
                <div className="absolute -bottom-16 -right-6 h-36 w-36 bg-blue-500/20 blur-3xl rounded-full"></div>
                <div className="relative backdrop-blur-md bg-white/10 border border-white/10 rounded-2xl shadow-2xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg">S</div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-300 font-semibold">Your Branded Portal</p>
                        <p className="text-lg font-bold">Employment Application</p>
                      </div>
                    </div>
                    <span className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-400/30 font-bold">LIVE</span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </div>
                      <div>
                        <p className="font-bold">Applicant</p>
                        <p className="text-xs text-slate-300">Ready to collect signatures</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-gradient-to-r from-emerald-600/40 to-blue-600/40">
                      <p className="text-sm font-semibold text-slate-100 mb-1">Share anywhere</p>
                      <p className="text-xs text-slate-200 font-mono truncate">yourdomain.com/employment-app</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs text-center">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="font-bold text-white text-lg">78</p>
                      <p className="text-slate-300">Submissions</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="font-bold text-white text-lg">94%</p>
                      <p className="text-slate-300">Conversion</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="font-bold text-white text-lg">8 min</p>
                      <p className="text-slate-300">Avg. time</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Pricing Comparison Section */}
            <section className="mb-32">
              <div className="text-center mb-12">
                <h2 className="text-3xl lg:text-4xl font-bold mb-4">Why Pay for Enterprise When You Only Need Static Links?</h2>
                <p className="text-xl text-slate-300">Zoho Sign Enterprise has many features. But if you just need shareable form links and QR codes, why pay $275/user/year?</p>
              </div>
              <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {/* Zoho Sign Enterprise */}
                <div className="relative bg-white/5 border-2 border-white/10 rounded-2xl p-8">
                  <div className="absolute -top-4 left-8 px-4 py-1 bg-slate-700 text-white text-sm font-bold rounded-full">Zoho Sign Enterprise</div>
                  <div className="pt-4">
                    <div className="flex items-baseline gap-2 mb-6">
                      <span className="text-5xl font-bold">$275</span>
                      <span className="text-slate-400 text-lg">/user/year</span>
                    </div>
                    <p className="text-slate-400 mb-6">For a team of 12 users</p>
                    <div className="text-3xl font-bold text-red-400 mb-8">$3,300/year total</div>
                    <ul className="space-y-3 text-slate-300">
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                        <span>Charged per user seat</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                        <span>Complex enterprise setup</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                        <span>Annual contract required</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                        <span>Dozens of enterprise features (branding, workflows, teams, etc.)</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* SignFlow Pro */}
                <div className="relative bg-gradient-to-br from-emerald-600/20 to-blue-600/20 border-2 border-emerald-400/50 rounded-2xl p-8">
                  <div className="absolute -top-4 left-8 px-4 py-1 bg-gradient-to-r from-emerald-500 to-blue-600 text-white text-sm font-bold rounded-full shadow-lg">SignFlow Pro — Recommended</div>
                  <div className="pt-4">
                    <div className="flex items-baseline gap-2 mb-6">
                      <span className="text-5xl font-bold">$60</span>
                      <span className="text-slate-300 text-lg">/year per account</span>
                    </div>
                    <p className="text-slate-300 mb-6">Unlimited forms per account</p>
                    <div className="text-3xl font-bold text-emerald-400 mb-2">Save $3,240/year</div>
                    <p className="text-sm text-emerald-300 mb-6">(98% cost reduction)</p>
                    <ul className="space-y-3 text-slate-100">
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                        <span className="font-semibold">Unlimited forms per account</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                        <span className="font-semibold">5-minute setup</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                        <span className="font-semibold">Cancel anytime</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                        <span className="font-semibold">Just the one feature you need: static links + QR codes</span>
                      </li>
                    </ul>
                    <button
                      onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setView(ViewMode.ADMIN_LOGIN); }}
                      className="w-full mt-8 px-8 py-4 rounded-lg bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-bold text-base hover:shadow-xl hover:scale-105 transition-all"
                    >
                      Get Started — $60/Year
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Features Section */}
            <section className="mb-32">
              <div className="text-center mb-16">
                <h2 className="text-3xl lg:text-4xl font-bold mb-4">One Feature, Done Right</h2>
                <p className="text-xl text-slate-300 max-w-3xl mx-auto">Purpose-built for one thing: giving you shareable signing links and QR codes for your Zoho Sign templates. No enterprise bloat, no features you'll never use.</p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center mb-4 shadow-lg">
                    <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Permanent Signing Links</h3>
                  <p className="text-slate-300">Share one URL, use it forever. The link never expires and works for unlimited signers — no Zoho account required.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4 shadow-lg">
                    <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Live in 5 Minutes</h3>
                  <p className="text-slate-300">Connect Zoho Sign, pick a template, share the link. That's it. No developers, no IT team, no sales calls.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4 shadow-lg">
                    <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">See Who's Signing</h3>
                  <p className="text-slate-300">Track visits, completions, and drop-offs for each link. Know if your template is converting — and where people fall off.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mb-4 shadow-lg">
                    <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Print-Ready QR Codes</h3>
                  <p className="text-slate-300">Put them on posters, business cards, or handouts. They work forever — even if you change your template later.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg flex items-center justify-center mb-4 shadow-lg">
                    <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Your Brand, Your Page</h3>
                  <p className="text-slate-300">Add your logo, colors, and company info. Signers see your brand, not ours.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center mb-4 shadow-lg">
                    <svg aria-hidden="true" focusable="false" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Your Credentials Stay Safe</h3>
                  <p className="text-slate-300">We never access your signed documents. All signing happens directly on Zoho's platform — not ours.</p>
                </div>
              </div>
            </section>

            {/* Use Cases Section */}
            <section className="mb-32">
              <div className="text-center mb-16">
                <h2 className="text-3xl lg:text-4xl font-bold mb-4">Common Use Cases</h2>
                <p className="text-xl text-slate-300">Any Zoho Sign template that multiple people need to access and sign through the same link or QR code.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2">HR & Recruitment</h3>
                      <p className="text-slate-300 text-sm">Put a link on your careers page or QR code in your office. Every applicant fills out the same employment application form.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2">Legal & Compliance</h3>
                      <p className="text-slate-300 text-sm">Share a link via email or Slack for NDAs and waivers. Everyone signs the same template; no back-and-forth PDFs.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2">Events & Registration</h3>
                      <p className="text-slate-300 text-sm">Print QR codes on event posters or table tents. Attendees scan and sign liability waivers or registration forms instantly.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2">Real Estate & Property</h3>
                      <p className="text-slate-300 text-sm">Add a QR code to your "For Rent" sign. Prospective tenants scan it and fill out your rental application on the spot.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Requirements Section */}
            <section className="mb-32 bg-white/5 border border-white/10 rounded-2xl p-12">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold mb-6 text-center">What You Need to Get Started</h2>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 font-bold">1</div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">A Zoho Sign Account (Free or Paid)</h3>
                      <p className="text-slate-300">You need an active Zoho Sign account. The free plan works perfectly—no need for Enterprise.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 font-bold">2</div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">Zoho Sign API Credits</h3>
                      <p className="text-slate-300">Zoho charges $50 for API credits (purchased as needed). Each document signed costs 50 cents. Example: 100 signatures = $50 in credits.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 font-bold">3</div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">SignFlow Pro ($60/year)</h3>
                      <p className="text-slate-300">Our platform fee for unlimited custom signature portals, analytics, QR codes, and support.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-8 pt-8 border-t border-white/10 text-center">
                  <p className="text-2xl font-bold text-emerald-400 mb-2">Total Cost: $60/year + Zoho API usage</p>
                  <p className="text-slate-300 mb-2">Example: $60 SignFlow + $50 Zoho credits (100 docs) = $110/year</p>
                  <p className="text-slate-300">vs. $3,300/year for Zoho Sign Enterprise (12 users)</p>
                  <p className="text-lg font-semibold text-emerald-300 mt-2">Still saving thousands annually</p>
                </div>
              </div>
            </section>


            {/* FAQ Section */}
            <section className="mb-32">
              <div className="text-center mb-16">
                <h2 className="text-3xl lg:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
              </div>
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-2">Do I need Zoho Sign Enterprise?</h3>
                  <p className="text-slate-300">No. SignFlow Pro works with any Zoho Sign plan that has API access enabled. You do not need to upgrade to Enterprise.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-2">What does it cost?</h3>
                  <p className="text-slate-300">SignFlow Pro is $60/year flat — no per-user fees, no hidden charges from us. You also pay Zoho Sign's standard API rate of $0.50 per document sent. For most small businesses sending under 200 documents/year, total cost is under $160.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-2">How long does setup take?</h3>
                  <p className="text-slate-300">About 5 minutes. Connect your Zoho Sign API credentials, select a template, and get a shareable link instantly.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-2">What happens when someone clicks my link?</h3>
                  <p className="text-slate-300">They see a branded page with your company info. They enter their name and email, then are taken directly to your Zoho Sign document to sign — no Zoho account required for signers.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-2">Is it secure?</h3>
                  <p className="text-slate-300">Yes. Your API credentials are encrypted and stored securely. We never access your signed documents — all signing happens directly through Zoho Sign's platform.</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-2">Can I cancel anytime?</h3>
                  <p className="text-slate-300">Yes. No contracts, no cancellation fees. You keep full access through the end of your billing period.</p>
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section className="text-center bg-gradient-to-br from-emerald-600/20 to-blue-600/20 border-2 border-emerald-400/30 rounded-2xl p-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">Stop Paying for Features You Don't Use</h2>
              <p className="text-xl text-slate-200 mb-8 max-w-2xl mx-auto">Get shareable links and QR codes for your Zoho Sign templates without upgrading to Enterprise.</p>
              <div className="flex flex-wrap gap-4 justify-center">
                <button
                  onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setView(ViewMode.ADMIN_LOGIN); }}
                  className="px-10 py-5 rounded-lg bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all"
                >
                  Start Your Free Trial
                </button>
                <button
                  onClick={() => { window.location.hash = '#/admin/login'; setAuthMode('login'); setView(ViewMode.ADMIN_LOGIN); }}
                  className="px-10 py-5 rounded-lg border-2 border-white/50 text-white font-bold text-lg hover:bg-white/10 transition-all"
                >
                  Sign In
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-6">No credit card required • Setup in 5 minutes • Cancel anytime</p>
            </section>
          </main>
        </div>
      )}

      {view === ViewMode.ADMIN_LOGIN && (
        <main id="main-content">
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className={`w-full max-w-md ${darkMode ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'} p-10 rounded-lg shadow-2xl border`}>
            <div className="text-center mb-8 space-y-3">
              <div className={`inline-flex items-center justify-center w-20 h-20 ${darkMode ? 'bg-slate-800 text-white' : 'bg-blue-600 text-white'} rounded-lg font-bold text-4xl shadow-lg shadow-blue-500/30`}>S</div>
              <h1 className="text-3xl font-bold tracking-tight">
                {authMode === 'login' ? 'Admin Login' : 'Create Admin Account'}
              </h1>
              <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Mode: <span className={`${darkMode ? 'text-blue-300' : 'text-blue-600'} uppercase tracking-wide`}>{authMode}</span>
              </p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <input type="email" autoComplete="username" autoFocus className={`w-full px-6 py-4 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg text-center font-semibold text-md outline-none focus:ring-4 focus:ring-blue-500/10`} value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Email" />
              <input type="password" autoComplete="current-password" className={`w-full px-6 py-4 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg text-center font-semibold text-md outline-none focus:ring-4 focus:ring-blue-500/10`} value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" />
              {error && (
                <div className={`text-sm font-medium rounded-lg px-4 py-3 text-center ${darkMode ? 'text-red-300 bg-red-950 border border-red-900' : 'text-red-600 bg-red-50 border border-red-200'}`}>
                  {error}
                </div>
              )}
              <button disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-lg font-bold text-lg hover:bg-slate-800 transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Please wait…' : authMode === 'login' ? 'Access Dashboard' : 'Create Account'}
              </button>
              <div className="text-center text-xs text-slate-400">
                {authMode === 'login' ? (
                  <button type="button" onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setError(null); }} className="underline font-semibold">
                    Need an account? Sign up
                  </button>
                ) : (
                  <button type="button" onClick={() => { window.location.hash = '#/admin/login'; setAuthMode('login'); setError(null); }} className="underline font-semibold">
                    Already have an account? Log in
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        </main>
      )}

      {view === ViewMode.ADMIN_DASHBOARD && (
        <main id="main-content">
        <div className="max-w-7xl mx-auto p-6 lg:p-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-12">
            <div className="flex items-center gap-5">
               <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-slate-700/30">S</div>
               <div>
                  <h1 className={`text-2xl sm:text-4xl font-bold tracking-tight ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>SignFlow Dashboard</h1>
                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-xs font-medium uppercase tracking-wider`}>Admin · Integrations</p>
               </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { window.location.hash = ''; setView(ViewMode.LANDING); }} className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                Home
              </button>
              <button onClick={() => setDarkMode(!darkMode)} className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button onClick={() => { window.location.hash = '#/admin/settings'; setView(ViewMode.ADMIN_SETTINGS); }} className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Settings</button>
              <button onClick={async () => {
                await supabase.auth.signOut();
                setSessionToken(null);
                setUserId(null);
                setAuth(null);
                setForms([]);
                // Reset debounce flags for next login
                setFormsFetchAttempted(false);
                setCredentialsFetchAttempted(false);
                setSubscriptionFetchAttempted(false);
                setView(ViewMode.ADMIN_LOGIN);
                window.location.hash = '';
              }} className={`px-6 py-2.5 rounded-lg border text-xs font-semibold transition-all uppercase tracking-wide ${darkMode ? 'border-slate-700 text-slate-300 hover:text-red-400' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>Logout</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Form Editor */}
            <div className="lg:col-span-5">
              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'} p-8 rounded-lg shadow-lg lg:sticky lg:top-8`}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className={`font-bold text-2xl ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>{editingId ? "Edit" : "New"} Integration</h3>
                  {editingId && <button onClick={clearForm} className={`text-[10px] px-3 py-1.5 rounded-md font-bold border ${darkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>Cancel</button>}
                </div>

                <form onSubmit={saveForm} className={`space-y-6 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  <div className="space-y-4">
                    <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Display Name (e.g. NDA Agreement)" className={`w-full px-5 py-4 rounded-lg text-sm font-bold outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    <input required value={slug} onChange={e => setSlug(e.target.value)} placeholder="URL Slug (e.g. nda-agreement)" className={`w-full px-5 py-4 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Zoho Template ID" className={`w-full px-5 py-4 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                      <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role (e.g. Signer 1)" className={`w-full px-5 py-4 rounded-lg text-sm font-bold outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                    <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="API Domain (e.g. https://sign.zoho.com)" className={`w-full px-5 py-4 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                  </div>

                  {error && (
                    <div className={`p-4 text-sm font-medium rounded-lg ${darkMode ? 'bg-red-950/50 text-red-300 border border-red-900' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                       {error}
                    </div>
                  )}

                  <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} p-6 rounded-xl space-y-4`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-[11px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Zoho Credentials</label>
                      <span className={`text-[11px] font-black ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Managed at account level</span>
                    </div>
                    <p className={`text-[12px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Templates and roles are set per form. Client ID/Secret and Refresh Token are saved once per account below.
                    </p>
                  </div>

                  <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-lg font-black text-lg hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? "Saving..." : (editingId ? "Update Integration" : "Create Integration")}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column - Forms List */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`text-2xl font-black ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Your Forms</h2>
                <button onClick={() => { clearForm(); setEditingId(null); }} className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>+ New</button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl border flex items-start justify-between animate-in slide-in-from-top duration-300 ${testResult.success
                  ? (darkMode ? 'bg-green-950 border-green-900 text-green-200' : 'bg-green-50 border-green-100 text-green-700')
                  : (darkMode ? 'bg-red-950 border-red-900 text-red-200' : 'bg-red-50 border-red-100 text-red-700')}`}>
                  <div>
                    <p className="font-bold text-sm mb-1">{testResult.success ? '✓ Connection Verified' : '✕ Connection Error'}</p>
                    <p className="text-xs opacity-80">{testResult.message}</p>
                  </div>
                  <button onClick={() => setTestResult(null)} className="opacity-50 hover:opacity-100 text-lg">×</button>
                </div>
              )}

              {/* Forms Grid - Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {forms.map(form => (
                  <div 
                    key={form.id} 
                    onClick={() => openFormDetails(form)}
                    onKeyDown={(e) => handleEnterOrSpace(e, () => openFormDetails(form))}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open details for ${form.name}`}
                    className={`${darkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-400'} p-5 rounded-xl border cursor-pointer transition-all hover:shadow-lg group focus-visible:ring-2 focus-visible:ring-blue-500 outline-none`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-bold text-lg truncate ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{form.name}</h3>
                        <code className={`block truncate text-xs font-mono ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>/{form.slug}</code>
                      </div>
                      <div className={`w-2 h-2 rounded-full bg-green-500 mt-2`} title="Live"></div>
                    </div>
                    
                    {/* Quick Stats */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                        {form.apiDomain.split('.').pop()?.toUpperCase()}
                      </span>
                      {form.landingConfig?.logoUrl && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${darkMode ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>
                          Branded
                        </span>
                      )}
                    </div>
                    
                    {/* Quick Actions (stop propagation so card click doesn't fire) */}
                    <div className="card-quick-actions flex items-center gap-2 pt-2 border-t transition-opacity" style={{ borderColor: darkMode ? '#334155' : '#E2E8F0' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/${form.slug}`); setCopiedLinkId(form.id); setTimeout(() => setCopiedLinkId(prev => prev === form.id ? null : prev), 2000); }}
                        className={`text-[10px] px-2 py-1 rounded font-semibold ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                      >
                        {copiedLinkId === form.id ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setQrModalForm(form); setQrModalOpen(true); }}
                        className={`text-[10px] px-2 py-1 rounded font-semibold ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                      >
                        QR Code
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); runConnectionTest(form); }}
                        disabled={testingId === form.id}
                        className={`text-[10px] px-2 py-1 rounded font-semibold ${darkMode ? 'text-green-400 hover:text-green-300 hover:bg-green-900/30' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                      >
                        {testingId === form.id ? 'Testing...' : 'Test'}
                      </button>
                    </div>
                  </div>
                ))}
                
                {forms.length === 0 && (
                  <div className={`col-span-1 md:col-span-2 p-12 text-center rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>
                    <p className="font-semibold mb-2">No forms yet</p>
                    <p className="text-sm">Create your first form using the panel on the left</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
        </main>
      )}

      {/* Form Details Page */}
      {view === ViewMode.FORM_DETAILS && (() => {
        const selectedForm = getSelectedForm();
        if (!selectedForm) {
          return (
            <main id="main-content">
            <div className="max-w-4xl mx-auto p-6 lg:p-12 text-center">
              <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Form not found</p>
              <button onClick={() => { setView(ViewMode.ADMIN_DASHBOARD); window.location.hash = '#/admin/dashboard'; }} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">
                Back to Dashboard
              </button>
            </div>
            </main>
          );
        }
        
        return (
        <main id="main-content">
        <div className="max-w-5xl mx-auto p-6 lg:p-12">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => { setView(ViewMode.ADMIN_DASHBOARD); window.location.hash = '#/admin/dashboard'; }}
                aria-label="Back to dashboard"
                className={`p-2 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <svg aria-hidden="true" focusable="false" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>{selectedForm.name}</h1>
                <code className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>/{selectedForm.slug}</code>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
              <a 
                href={`/${selectedForm.slug}`} 
                target="_blank" 
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                View Live →
              </a>
              <button 
                onClick={() => deleteForm(selectedForm.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  deleteConfirmId === selectedForm.id
                    ? (darkMode ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-red-600 text-white hover:bg-red-700')
                    : (darkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50')
                }`}
              >
                {deleteConfirmId === selectedForm.id ? 'Confirm Delete?' : 'Delete'}
              </button>
              {deleteConfirmId === selectedForm.id && (
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          
          {/* Tabs */}
          <div className="overflow-x-auto mb-6">
          <div className={`flex gap-1 p-1 rounded-lg min-w-max sm:min-w-0 ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
            {[
              { id: 'settings', label: 'Settings' },
              { id: 'landing', label: 'Landing Page' },
              { id: 'signers', label: 'Signers & Delivery' },
              { id: 'embed', label: 'Embed' },
              { id: 'qr', label: 'QR Code' },
              { id: 'analytics', label: 'Analytics' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setDetailsTab(tab.id as any);
                  // Auto-load analytics when analytics tab is clicked
                  if (tab.id === 'analytics' && selectedForm && !analytics.has(selectedForm.id)) {
                    fetchAnalytics(selectedForm.id);
                  }
                  // Load QR data on-demand when QR tab is opened
                  if (tab.id === 'qr' && selectedForm && !qrCodes.has(selectedForm.id) && !loadingQR.has(selectedForm.id)) {
                    fetchQRCode(selectedForm.id);
                  }
                  // Load Zoho template roles on-demand when Signers tab is opened
                  if (tab.id === 'signers' && selectedForm && templateRoles.length === 0 && !loadingRoles) {
                    loadTemplateRoles(selectedForm);
                  }
                }}
                className={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                  detailsTab === tab.id 
                    ? (darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 shadow-sm')
                    : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          </div>
          
          {error && (
            <div className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-red-950/50 text-red-300 border border-red-900' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {error}
            </div>
          )}
          
          {/* Settings Tab */}
          {detailsTab === 'settings' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <h2 className={`text-lg font-bold mb-6 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Form Settings</h2>
              <form onSubmit={saveForm} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Display Name</label>
                    <input required value={formName} onChange={e => setFormName(e.target.value)} className={`w-full px-4 py-3 rounded-lg text-sm font-medium outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                  </div>
                  <div className="space-y-2">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>URL Slug</label>
                    <input required value={slug} onChange={e => setSlug(e.target.value)} className={`w-full px-4 py-3 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Zoho Template ID</label>
                    <input required value={templateId} onChange={e => setTemplateId(e.target.value)} className={`w-full px-4 py-3 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                  </div>
                  <div className="space-y-2">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Signer Role</label>
                    <input required value={roleName} onChange={e => setRoleName(e.target.value)} className={`w-full px-4 py-3 rounded-lg text-sm font-medium outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>API Domain</label>
                  <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} className={`w-full px-4 py-3 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                </div>
                <div className="pt-4">
                  <button type="submit" disabled={loading} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {/* Landing Page Tab */}
          {detailsTab === 'landing' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <h2 className={`text-lg font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Landing Page Design</h2>
              <p className={`text-sm mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Customize how your form page looks to visitors</p>
              
              <form onSubmit={saveForm} className="space-y-6">
                {/* Branding Section */}
                <div className={`p-5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <h3 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Branding</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="landing-logo-url" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Logo URL</label>
                      <input 
                        id="landing-logo-url"
                        aria-label="Logo URL for landing page"
                        aria-describedby="logo-url-help"
                        value={landingLogoUrl} 
                        onChange={e => setLandingLogoUrl(e.target.value)} 
                        onBlur={e => {
                          const url = e.target.value.trim();
                          if (url && !url.startsWith('https://')) {
                            setError('Logo URL must use HTTPS for security (e.g., https://example.com/logo.png)');
                          } else {
                            setError(null);
                          }
                        }}
                        placeholder="https://yoursite.com/logo.png" 
                        className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} 
                      />
                      {landingLogoUrl && !landingLogoUrl.startsWith('https://') && (
                        <p id="logo-url-help" className="text-xs text-red-500" role="alert">⚠️ Must use HTTPS</p>
                      )}
                    </div>
                    {landingLogoUrl && (
                      <div className="space-y-2">
                        <label htmlFor="landing-logo-alt" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Logo Alt Text <span className="text-red-500" aria-label="required">*</span>
                        </label>
                        <input 
                          id="landing-logo-alt"
                          aria-label="Descriptive alt text for logo image"
                          aria-describedby="alt-text-help"
                          aria-required="true"
                          value={landingLogoAlt} 
                          onChange={e => {
                            setLandingLogoAlt(e.target.value);
                            const validation = validateAltText(e.target.value);
                            if (!validation.valid) {
                              setAltTextError(validation.errors[0]);
                            } else {
                              setAltTextError(null);
                            }
                          }}
                          placeholder="e.g., ACME Corporation logo" 
                          className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${altTextError ? 'border-red-500' : ''} ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} 
                        />
                        <p id="alt-text-help" className="text-xs text-slate-500">Describe your logo for screen readers (5-125 characters)</p>
                        {altTextError && (
                          <p className="text-xs text-red-500" role="alert">⚠️ {altTextError}</p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label htmlFor="landing-primary-color" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Primary Color (Button)</label>
                        <div className="flex gap-2">
                          <input id="landing-primary-color-picker" type="color" value={landingPrimaryColor} onChange={e => {
                            setLandingPrimaryColor(e.target.value);
                            const validation = validateContrast('#FFFFFF', e.target.value, 'AA', true);
                            if (!validation.valid) {
                              setContrastWarning('Button contrast: ' + (validation.suggestion || ''));
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Primary color picker" className="w-12 h-10 rounded cursor-pointer" />
                          <input id="landing-primary-color" value={landingPrimaryColor} onChange={e => {
                            setLandingPrimaryColor(e.target.value);
                            const validation = validateContrast('#FFFFFF', e.target.value, 'AA', true);
                            if (!validation.valid) {
                              setContrastWarning('Button contrast: ' + (validation.suggestion || ''));
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Primary color hex value" className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="landing-background-color" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Background Color (Page)</label>
                        <div className="flex gap-2">
                          <input id="landing-background-color-picker" type="color" value={landingBackgroundColor} onChange={e => {
                            setLandingBackgroundColor(e.target.value);
                            // Validate that page text (#1E293B) will be readable against the background
                            const validation = validateContrast('#1E293B', e.target.value, 'AA', false);
                            if (!validation.valid) {
                              setContrastWarning('Background contrast: ' + (validation.suggestion || ''));
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Background color picker" className="w-12 h-10 rounded cursor-pointer" />
                          <input id="landing-background-color" value={landingBackgroundColor} onChange={e => {
                            setLandingBackgroundColor(e.target.value);
                            // Validate that page text (#1E293B) will be readable against the background
                            const validation = validateContrast('#1E293B', e.target.value, 'AA', false);
                            if (!validation.valid) {
                              setContrastWarning('Background contrast: ' + (validation.suggestion || ''));
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Background color hex value" className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`} />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="landing-card-color" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Card Color (Form)</label>
                        <div className="flex gap-2">
                          <input id="landing-card-color-picker" type="color" value={landingCardColor} onChange={e => {
                            setLandingCardColor(e.target.value);
                            // Validate that form text (#1E293B) will be readable against the card
                            const validation = validateContrast('#1E293B', e.target.value, 'AA', false);
                            if (!validation.valid) {
                              setContrastWarning('Card contrast: ' + (validation.suggestion || ''));
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Card color picker" className="w-12 h-10 rounded cursor-pointer" />
                          <input id="landing-card-color" value={landingCardColor} onChange={e => {
                            setLandingCardColor(e.target.value);
                            // Validate that form text (#1E293B) will be readable against the card
                            const validation = validateContrast('#1E293B', e.target.value, 'AA', false);
                            if (!validation.valid) {
                              setContrastWarning('Card contrast: ' + (validation.suggestion || ''));
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Card color hex value" className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`} />
                        </div>
                      </div>
                    {contrastWarning && (
                      <div className="p-3 text-xs rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)' }} role="alert">
                        ⚠️ {contrastWarning}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Button Text</label>
                      <input value={landingButtonText} onChange={e => setLandingButtonText(e.target.value)} placeholder="Sign Now" className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                  </div>
                </div>
                
                {/* Content Section */}
                <div className={`p-5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <h3 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Content</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Headline (optional)</label>
                      <input value={landingHeadline} onChange={e => setLandingHeadline(e.target.value)} placeholder={formName || 'Leave blank to use form name'} className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description</label>
                      <textarea value={landingDescription} onChange={e => setLandingDescription(e.target.value)} placeholder="Describe what this form is for..." rows={3} className={`w-full px-4 py-3 rounded-lg text-sm outline-none border resize-none ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                  </div>
                </div>
                
                {/* Contact Info Section */}
                <div className={`p-5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <h3 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Company Name</label>
                      <input value={landingCompanyName} onChange={e => setLandingCompanyName(e.target.value)} placeholder="ACME Inc." className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Email</label>
                      <input value={landingContactEmail} onChange={e => setLandingContactEmail(e.target.value)} placeholder="support@example.com" className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Phone</label>
                      <input value={landingContactPhone} onChange={e => setLandingContactPhone(e.target.value)} placeholder="(555) 123-4567" className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Footer Text</label>
                      <input value={landingFooterText} onChange={e => setLandingFooterText(e.target.value)} placeholder="© 2026 Your Company" className={`w-full px-4 py-3 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                  </div>
                </div>
                
                {/* Options Section */}
                <div className={`p-5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <h3 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Options</h3>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={landingShowPoweredBy} onChange={e => setLandingShowPoweredBy(e.target.checked)} className="w-4 h-4 rounded" />
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Show "Powered by SignFlow" badge</span>
                  </label>
                </div>
                
                <div className="pt-4">
                  <button type="submit" disabled={loading} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {loading ? 'Saving...' : 'Save Landing Page'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Signers & Delivery Tab */}
          {detailsTab === 'signers' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                <h2 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Signers &amp; Delivery</h2>
                <button
                  type="button"
                  onClick={() => selectedForm && loadTemplateRoles(selectedForm)}
                  disabled={loadingRoles || !selectedForm}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${darkMode ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                >
                  {loadingRoles ? 'Loading…' : (templateRoles.length > 0 ? 'Refresh roles from Zoho' : 'Load roles from Zoho')}
                </button>
              </div>
              <p className={`text-sm mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Override who fills each role of your Zoho Sign template. The public signer role (collected from the public form) is shown for reference. For other roles, set a recipient and choose whether Zoho emails them or delivers an embedded signing link.
              </p>

              {templateRoles.length === 0 && !loadingRoles && (
                <div className={`p-4 rounded-lg text-sm ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                  Click <strong>Load roles from Zoho</strong> to fetch the roles defined in this form&apos;s template.
                </div>
              )}

              {templateRoles.length > 0 && (
                <form onSubmit={saveForm} className="space-y-5">
                  <div className="space-y-4">
                    {templateRoles.map(role => {
                      const ed = signerRoles[role.role] || { recipientName: '', recipientEmail: '', deliveryMode: 'email' as const };
                      const actionLabel = role.actionType === 'VIEW' ? 'Receives a copy' : role.actionType === 'APPROVER' ? 'Approver' : role.actionType === 'INPERSONSIGN' ? 'In-person signer' : 'Signer';
                      return (
                        <div key={role.role} className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{role.role || '(unnamed role)'}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-white text-slate-600 border border-slate-200'}`}>{actionLabel}</span>
                              {role.isPublic && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>Public signer</span>
                              )}
                            </div>
                          </div>

                          {role.isPublic ? (
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              Collected from the public form at submit time. No configuration needed here.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Recipient Name</label>
                                <input
                                  value={ed.recipientName}
                                  onChange={e => setSignerRoles(prev => ({ ...prev, [role.role]: { ...ed, recipientName: e.target.value } }))}
                                  placeholder="e.g., Jane Reviewer"
                                  className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Recipient Email</label>
                                <input
                                  type="email"
                                  value={ed.recipientEmail}
                                  onChange={e => setSignerRoles(prev => ({ ...prev, [role.role]: { ...ed, recipientEmail: e.target.value } }))}
                                  placeholder="jane@example.com"
                                  className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Delivery</label>
                                <select
                                  value={ed.deliveryMode}
                                  onChange={e => setSignerRoles(prev => ({ ...prev, [role.role]: { ...ed, deliveryMode: e.target.value as 'embedded' | 'email' } }))}
                                  className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
                                >
                                  <option value="email">Email (Zoho sends)</option>
                                  <option value="embedded">Embedded (inline link)</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Notes to recipients (optional)</label>
                    <textarea
                      value={signerNotes}
                      onChange={e => setSignerNotes(e.target.value)}
                      placeholder="Message included with the signing request"
                      rows={3}
                      className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    />
                  </div>

                  <div className="pt-2">
                    <button type="submit" disabled={loading} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                      {loading ? 'Saving...' : 'Save Signers & Delivery'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Embed Tab */}
          {detailsTab === 'embed' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <div className="mb-6">
                <h2 className={`text-lg font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Embed This Signing Page</h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Copy this iframe into your website to let visitors start signing without leaving your page.</p>
              </div>

              <div className={`mb-5 rounded-lg border p-4 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <label htmlFor="embed-code" className={`block text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Embed Code</label>
                <textarea
                  id="embed-code"
                  readOnly
                  value={buildEmbedCode(selectedForm)}
                  className={`w-full min-h-32 resize-none rounded-lg border p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyEmbedCode(selectedForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                  >
                    {copiedEmbedId === selectedForm.id ? 'Copied!' : 'Copy Embed Code'}
                  </button>
                  <a
                    href={buildEmbedUrl(selectedForm.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    Preview Embed
                  </a>
                </div>
              </div>

              <div className={`rounded-lg border p-4 text-sm ${darkMode ? 'bg-blue-950/30 border-blue-900 text-blue-200' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                Tip: set the iframe height to at least <code className="font-mono">720px</code>. If your website supports responsive embeds, keep <code className="font-mono">width="100%"</code>.
              </div>
            </div>
          )}
          
          {/* QR Code Tab */}
          {detailsTab === 'qr' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className={`text-lg font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>QR Code</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Download QR codes for print materials</p>
                </div>
                <button 
                  onClick={() => regenerateQR(selectedForm.id)}
                  disabled={loadingQR.has(selectedForm.id)}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 transition-colors text-sm disabled:opacity-50"
                >
                  {loadingQR.has(selectedForm.id) ? 'Refreshing...' : 'Refresh QR Image'}
                </button>
              </div>
              
              {qrCodes.has(selectedForm.id) ? (
                <div className="text-center">
                  <img 
                    src={qrCodes.get(selectedForm.id)} 
                    alt="QR Code" 
                    className="inline-block p-4 bg-white rounded-lg mb-4 max-w-64 h-auto"
                  />
                  <div className="flex gap-2 justify-center">
                    <button 
                      onClick={() => { setQrModalForm(selectedForm); setQrModalOpen(true); }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                    >
                      Download QR Code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {loadingQR.has(selectedForm.id) ? 'Loading QR code...' : 'No QR image has been generated yet.'}
                  </p>
                  <button 
                    onClick={() => generateQRCode(selectedForm.id)}
                    disabled={loadingQR.has(selectedForm.id)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <svg aria-hidden="true" focusable="false" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    {loadingQR.has(selectedForm.id) ? 'Loading...' : 'Generate QR Code'}
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Analytics Tab */}
          {detailsTab === 'analytics' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className={`text-lg font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Analytics</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Track form visits and submissions</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={analyticsTimeWindow}
                    onChange={(e) => {
                      const newWindow = e.target.value as 'day' | 'week' | 'month' | 'all';
                      setAnalyticsTimeWindow(newWindow);
                      if (analytics.has(selectedForm.id)) {
                        fetchAnalytics(selectedForm.id, newWindow);
                      }
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'} border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value="day">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="all">All Time</option>
                  </select>
                  {analytics.has(selectedForm.id) && (
                    <button 
                      onClick={() => fetchAnalytics(selectedForm.id)}
                      className="px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 transition-colors text-sm"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </div>
              
              {loadingAnalytics.has(selectedForm.id) ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading analytics...</p>
                </div>
              ) : analytics.has(selectedForm.id) ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{analytics.get(selectedForm.id).summary.totalVisits}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Visits</p>
                    </div>
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{analytics.get(selectedForm.id).summary.totalSubmissions}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Submissions</p>
                    </div>
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {analytics.get(selectedForm.id).summary.totalVisits > 0 
                            ? Math.round((analytics.get(selectedForm.id).summary.totalSubmissions / analytics.get(selectedForm.id).summary.totalVisits) * 100)
                          : 0}%
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Conversion Rate</p>
                    </div>
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{analytics.get(selectedForm.id).recentEvents?.length || 0}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Recent Events</p>
                    </div>
                  </div>
                  
                  {analytics.get(selectedForm.id).summary.totalVisits === 0 && (
                    <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <p className="text-sm">No analytics data yet. Share your form to start collecting data!</p>
                      <p className="text-xs mt-2">Visit your form at: <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs">{window.location.origin}/{selectedForm.slug || selectedForm.id}</code></p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <button 
                    onClick={() => fetchAnalytics(selectedForm.id)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Load Analytics
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </main>
        );
      })()}

      {view === ViewMode.ADMIN_SETTINGS && (
        <main id="main-content">
        <div className="max-w-5xl mx-auto p-6 lg:p-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-lg shadow-slate-700/30">S</div>
              <div>
                <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Account Settings</h1>
                <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-xs font-semibold uppercase tracking-[0.2em]`}>Credentials · Subscription</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { window.location.hash = ''; setView(ViewMode.LANDING); }} className={`px-5 py-2 rounded-lg border text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Home</button>
              <button onClick={() => { window.location.hash = '#/admin/dashboard'; setView(ViewMode.ADMIN_DASHBOARD); }} className={`px-5 py-2 rounded-lg border text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Back to Dashboard</button>
              <button onClick={async () => {
                await supabase.auth.signOut();
                setSessionToken(null);
                setUserId(null);
                setAuth(null);
                setForms([]);
                // Reset debounce flags for next login
                setFormsFetchAttempted(false);
                setCredentialsFetchAttempted(false);
                setSubscriptionFetchAttempted(false);
                setView(ViewMode.ADMIN_LOGIN);
                window.location.hash = '';
              }} className={`px-5 py-2 rounded-lg border text-xs font-black transition-all uppercase tracking-widest ${darkMode ? 'border-slate-700 text-slate-300 hover:text-red-400' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>Logout</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'} rounded-2xl p-6 shadow-sm overflow-hidden`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.3em] font-black ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Zoho Account Settings</p>
                  <h3 className={`text-xl font-black ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Client & Token</h3>
                </div>
                {!credentialsLoaded && <span className="text-xs text-slate-400">Loading…</span>}
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="cred-client-id" className={`block text-xs font-bold mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Client ID</label>
                  <input id="cred-client-id" value={credClientId} onChange={e => setCredClientId(e.target.value)} placeholder="Client ID" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                </div>
                <div>
                  <label htmlFor="cred-client-secret" className={`block text-xs font-bold mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Client Secret</label>
                  <p className={`text-xs mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {credHasClientSecret
                      ? <span aria-label="Client secret: configured">●●●●●●●● configured — leave blank to keep existing</span>
                      : <span aria-label="Client secret: not configured">Not configured</span>}
                  </p>
                  <input id="cred-client-secret" type="password" value={credNewClientSecret} onChange={e => setCredNewClientSecret(e.target.value)} placeholder="New client secret (leave blank to keep existing)" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                </div>
                <div>
                  <label htmlFor="cred-refresh-token" className={`block text-xs font-bold mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Refresh Token</label>
                  <p className={`text-xs mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {credHasRefreshToken
                      ? <span aria-label="Refresh token: configured">●●●●●●●● configured — leave blank to keep existing</span>
                      : <span aria-label="Refresh token: not configured">Not configured</span>}
                  </p>
                  <input id="cred-refresh-token" value={credNewRefreshToken} onChange={e => setCredNewRefreshToken(e.target.value)} placeholder="New refresh token (leave blank to keep existing)" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                </div>
                <div>
                  <label htmlFor="cred-api-domain" className={`block text-xs font-bold mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>API Domain</label>
                  <input id="cred-api-domain" value={credApiDomain} onChange={e => setCredApiDomain(e.target.value)} placeholder="API Domain (https://sign.zoho.com)" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                </div>
                <button onClick={saveCredentials} className="w-full bg-slate-900 text-white py-3 rounded-lg font-black text-sm hover:bg-slate-800">Save Credentials</button>
              </div>
            </div>

            <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'} rounded-2xl p-6 shadow-sm`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.3em] font-black ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Subscription</p>
                  <h3 className={`text-xl font-black ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Plan & Status</h3>
                </div>
                {!subscriptionLoaded && <span className="text-xs text-slate-400">Loading…</span>}
              </div>
              <div className="space-y-3">
                <select
                  value={subscription?.plan || 'free'}
                  onChange={e => saveSubscription(e.target.value, subscription?.status || 'active', subscription?.seats)}
                  className={`w-full px-4 py-3 rounded-lg border text-sm font-bold ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                <select
                  value={subscription?.status || 'active'}
                  onChange={e => saveSubscription(subscription?.plan || 'free', e.target.value, subscription?.seats)}
                  className={`w-full px-4 py-3 rounded-lg border text-sm font-bold ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
                >
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={subscription?.seats ?? 1}
                  onChange={e => saveSubscription(subscription?.plan || 'free', subscription?.status || 'active', Number(e.target.value))}
                  className={`w-full px-4 py-3 rounded-lg border text-sm font-bold ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
                  placeholder="Seats"
                />
              </div>
            </div>
          </div>
        </div>
        </main>
      )}

      {view === ViewMode.PUBLIC_FORM && (() => {
        if (isFormLoading || !currentForm) {
          return (
            <main id="main-content">
              <div className="min-h-screen p-6 flex flex-col bg-slate-50">
                <div className="flex-1 flex items-center justify-center">
                  <div
                    role="status"
                    aria-live="polite"
                    className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl p-8"
                  >
                    <span className="sr-only">Loading signing form...</span>
                    <div className="flex justify-center mb-6">
                      <div className="h-12 w-32 rounded bg-slate-200 motion-safe:animate-pulse" />
                    </div>
                    <div className="mx-auto mb-4 h-14 w-14 rounded-lg bg-slate-200 motion-safe:animate-pulse" />
                    <div className="mx-auto mb-3 h-7 w-4/5 rounded bg-slate-200 motion-safe:animate-pulse" />
                    <div className="mx-auto mb-8 h-4 w-full rounded bg-slate-100 motion-safe:animate-pulse" />
                    <div className="space-y-5">
                      <div>
                        <div className="mb-2 h-3 w-24 rounded bg-slate-200 motion-safe:animate-pulse" />
                        <div className="h-12 rounded-lg border border-slate-200 bg-slate-50" />
                      </div>
                      <div>
                        <div className="mb-2 h-3 w-28 rounded bg-slate-200 motion-safe:animate-pulse" />
                        <div className="h-12 rounded-lg border border-slate-200 bg-slate-50" />
                      </div>
                      <div className="h-12 rounded-lg bg-slate-300 motion-safe:animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </main>
          );
        }

        // Get landing config with defaults
        const lc = currentForm?.landingConfig || {};
        const theme = lc.theme || {};
        const contact = lc.contact || {};
        
        // Derive instant title from slug, use API name if available
        const instantTitle = currentForm?.name || slugToTitle(window.location.pathname.substring(1).replace(/\/$/, ''));
        const headline = lc.headline || instantTitle;
        const description = lc.description;
        const buttonText = lc.buttonText || 'Sign Now';
        const showPoweredBy = lc.showPoweredBy !== false; // default true
        
        // Theme colors (use CSS variables for easy customization)
        const primaryColor = theme.primaryColor || '#3B82F6';
        const bgColor = theme.backgroundColor || (darkMode ? '#0F172A' : '#F8FAFC');
        const cardColor = theme.cardColor || (darkMode ? '#1E293B' : '#FFFFFF');
        
        // Calculate text color based on card background luminance for automatic contrast
        const getTextColorForBackground = (bgHex: string): { text: string, muted: string } => {
          // Use WCAG 2.1 relative luminance calculation
          const luminance = getRelativeLuminance(bgHex);
          
          // If background is dark (luminance < 0.5), use light text
          if (luminance < 0.5) {
            return { text: '#F1F5F9', muted: '#94A3B8' }; // Light text for dark backgrounds
          } else {
            return { text: '#1E293B', muted: '#64748B' }; // Dark text for light backgrounds
          }
        };
        
        const autoTextColors = getTextColorForBackground(cardColor);
        const textColor = theme.textColor || autoTextColors.text;
        const mutedColor = theme.mutedColor || autoTextColors.muted;
        
        return (
        <main id="main-content">
        <div className="min-h-screen p-6 flex flex-col" style={{ backgroundColor: bgColor }}>
          {/* Logo/Header area */}
          {lc.logoUrl && (
            <div className="text-center pt-6 pb-2">
              <img src={lc.logoUrl} alt={lc.logoAlt || 'Logo'} className="h-12 mx-auto object-contain" />
            </div>
          )}
          
          {/* Main content - centered */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-md">
              {successData ? (
                <div className="p-10 rounded-lg shadow-xl text-center animate-in zoom-in duration-500 border" style={{ backgroundColor: cardColor, borderColor: darkMode ? '#334155' : '#E2E8F0', color: textColor }}>
                  <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5', color: '#10B981' }}>
                    <svg aria-hidden="true" focusable="false" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Document Ready</h2>
                  <p className="text-sm mb-6" style={{ color: mutedColor }}>Your agreement is prepared and waiting.</p>
                  {successData.signingUrl ? (
                    <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full py-3.5 rounded-lg font-bold text-base shadow-lg hover:opacity-90 transition-all active:scale-[0.98]" style={{ backgroundColor: primaryColor, color: '#FFFFFF' }}>Open Signature Interface</button>
                  ) : (
                    <div className="p-4 rounded-lg text-sm font-medium" style={{ backgroundColor: darkMode ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF', color: primaryColor, border: `1px solid ${primaryColor}33` }}>
                      A secure link has been sent to your email.
                    </div>
                  )}
                  <button onClick={() => setSuccessData(null)} className="mt-6 font-semibold text-xs uppercase tracking-wider transition-colors hover:opacity-70" style={{ color: mutedColor }}>Go Back</button>
                </div>
              ) : (
                /* Landing page with form - loads INSTANTLY */
                <div className="rounded-lg shadow-xl border" style={{ backgroundColor: cardColor, borderColor: darkMode ? '#334155' : '#E2E8F0' }}>
                  <div className="p-8">
                    <div className="text-center mb-6">
                      {/* Icon */}
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg mb-4" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                        <svg aria-hidden="true" focusable="false" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </div>
                      
                      {/* Headline */}
                      <h1 className="text-2xl font-bold mb-2" style={{ color: textColor }}>{headline}</h1>
                      
                      {/* Description */}
                      {description ? (
                        <p className="text-sm leading-relaxed" style={{ color: mutedColor }}>{description}</p>
                      ) : (
                        <p className="text-sm" style={{ color: mutedColor }}>Digital Signature Gateway</p>
                      )}
                    </div>
                    
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!currentForm) {
                        setError('Form is still loading. Please wait a moment and try again.');
                        return;
                      }
                      const target = e.target as any;
                      handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                    }} className="space-y-5">
                      <div className="space-y-2">
                        {/* P4-02 + P4-12: linked label with required marker */}
                        <label htmlFor="signerName" className="text-xs font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>
                          Full Name <span aria-hidden="true" style={{ color: '#B91C1C' }}>*</span>
                        </label>
                        <input required id="signerName" name="signerName" placeholder="John Doe" autoFocus aria-required="true" className="w-full px-4 py-3 rounded-lg outline-none focus:ring-2 font-medium text-base border" style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', borderColor: darkMode ? '#334155' : '#E2E8F0', color: textColor, '--tw-ring-color': `${primaryColor}50` } as React.CSSProperties} />
                      </div>
                      <div className="space-y-2">
                        {/* P4-02 + P4-12: linked label with required marker */}
                        <label htmlFor="signerEmail" className="text-xs font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>
                          Email Address <span aria-hidden="true" style={{ color: '#B91C1C' }}>*</span>
                        </label>
                        <input required id="signerEmail" name="signerEmail" type="email" placeholder="john@example.com" aria-required="true" className="w-full px-4 py-3 rounded-lg outline-none focus:ring-2 font-medium text-base border" style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', borderColor: darkMode ? '#334155' : '#E2E8F0', color: textColor, '--tw-ring-color': `${primaryColor}50` } as React.CSSProperties} />
                      </div>
                      {/* P4-06: role="alert" so screen readers announce errors immediately */}
                      {error && (
                        <div role="alert" className="p-3 text-xs font-medium rounded-lg" style={{ backgroundColor: 'rgba(185, 28, 28, 0.1)', color: '#B91C1C', border: '1px solid rgba(185, 28, 28, 0.3)' }}>
                           {error}
                        </div>
                      )}
                      {/* UX-05: Privacy disclosure */}
                      <p className="text-[11px] leading-relaxed" style={{ color: mutedColor }}>
                        By submitting, you agree that your name and email will be shared with the document sender to complete signing via Zoho Sign. We do not store your information beyond what is needed to process your signature.
                      </p>
                      <button disabled={loading} className="w-full py-3.5 rounded-lg font-bold text-base shadow-lg transition-all active:scale-[0.98] disabled:opacity-50" style={{ backgroundColor: primaryColor, color: '#FFFFFF', boxShadow: `0 4px 14px ${primaryColor}30` }}>
                        {loading ? "Preparing Document..." : buttonText}
                      </button>
                    </form>
                  </div>
                  
                  {/* Contact info footer */}
                  {(contact.companyName || contact.email || contact.phone) && (
                    <div className="px-8 py-4 border-t text-center text-xs" style={{ borderColor: darkMode ? '#334155' : '#E2E8F0', color: mutedColor }}>
                      {contact.companyName && <span className="font-semibold">{contact.companyName}</span>}
                      {contact.companyName && (contact.email || contact.phone) && <span className="mx-2">•</span>}
                      {contact.email && <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>}
                      {contact.email && contact.phone && <span className="mx-2">•</span>}
                      {contact.phone && <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Footer */}
          <div className="text-center py-4 text-xs" style={{ color: mutedColor }}>
            {lc.footerText && <p className="mb-1">{lc.footerText}</p>}
            {showPoweredBy && (
              <p className="opacity-60">Powered by <a href="https://signflow.ink" className="hover:underline">SignFlow</a></p>
            )}
          </div>
        </div>
        </main>
        );
      })()}

      {view === ViewMode.NOT_FOUND && (
        <main id="main-content">
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-xl">
            <h1 className={`text-[clamp(4rem,25vw,10rem)] font-black leading-none ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>404</h1>
            <h2 className={`text-4xl font-black mb-4 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Signing Page Unavailable</h2>
            <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {error || 'This signing page could not be found. Please check the link or contact the sender.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-block px-8 py-3 bg-slate-900 rounded-full text-white font-bold text-sm uppercase tracking-widest shadow-xl focus-visible:ring-2 focus-visible:ring-white outline-none"
            >
              Try Again
            </button>
          </div>
        </div>
        </main>
      )}

      {/* QR Code Modal */}
      {qrModalForm && (
        <QRCodeModal
          isOpen={qrModalOpen}
          onClose={() => {
            setQrModalOpen(false);
            setQrModalForm(null);
          }}
          url={buildFormUrl(qrModalForm.slug)}
          formName={qrModalForm.name}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};

export default App;
