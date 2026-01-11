
import React, { useState, useEffect, useRef } from 'react';
import { ViewMode, FormDefinition, SignerData, UserCredentials, SubscriptionPlan } from './types';
import Header from './components/Header';
import QRCodeModal from './components/QRCodeModal';
import { triggerZohoSignTemplate, testZohoConnection } from './services/zohoService';
import { supabase } from './services/supabaseClient';
import { getRouteContext, buildFormUrl } from './services/routingService';
import { validateContrast, validateAltText, KeyCodes, handleEnterOrSpace } from './utils/accessibility';


// Reserved slugs that cannot be used for forms
const RESERVED_SLUGS = ['api', 'admin', 'assets', 'static', 'public', '_next', 'favicon.ico'];

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

  // If a user hits the bare root domain (e.g. signflow.ink), send them to www with full path
  if (routeContext.subdomain === 'root') {
    const hostnameParts = window.location.hostname.split('.').slice(-2);
    const baseDomain = hostnameParts.join('.');
    const targetUrl = `${window.location.protocol}//www.${baseDomain}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(targetUrl);
    return null;
  }

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
  
  const [view, setView] = useState<ViewMode | null>(getInitialView());
  // For public forms, we don't need to wait for auth - resolve immediately
  const [isRouteResolved, setIsRouteResolved] = useState(isPublicFormPage());
  const [isFormLoading, setIsFormLoading] = useState(isPublicFormPage());
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

  // User-level Zoho credentials
  const [credClientId, setCredClientId] = useState('');
  const [credClientSecret, setCredClientSecret] = useState('');
  const [credRefreshToken, setCredRefreshToken] = useState('');
  const [credApiDomain, setCredApiDomain] = useState('https://sign.zoho.com');
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  const [subscription, setSubscription] = useState<SubscriptionPlan | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  
  // QR Code Modal state
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalForm, setQrModalForm] = useState<FormDefinition | null>(null);
  
  // Form Details page state
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<'settings' | 'landing' | 'qr' | 'analytics'>('settings');
  
  // Landing page editor state
  const [landingHeadline, setLandingHeadline] = useState('');
  const [landingDescription, setLandingDescription] = useState('');
  const [landingLogoUrl, setLandingLogoUrl] = useState('');
  const [landingPrimaryColor, setLandingPrimaryColor] = useState('#3B82F6');
  const [landingBackgroundColor, setLandingBackgroundColor] = useState('#F8FAFC');
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
  
  // QR Code and Analytics states (legacy - keeping for compatibility)
  const [qrCodes, setQrCodes] = useState<Map<string, string>>(new Map());
  const [analytics, setAnalytics] = useState<Map<string, any>>(new Map());
  const [loadingQR, setLoadingQR] = useState<Set<string>>(new Set());
  const [loadingAnalytics, setLoadingAnalytics] = useState<Set<string>>(new Set());
  const [analyticsTimeWindow, setAnalyticsTimeWindow] = useState<'day' | 'week' | 'month' | 'all'>('week');

  
  // Debounce flags to prevent infinite retry loops
  const [credentialsFetchAttempted, setCredentialsFetchAttempted] = useState(false);
  const [subscriptionFetchAttempted, setSubscriptionFetchAttempted] = useState(false);
  const [formsFetchAttempted, setFormsFetchAttempted] = useState(false);
  
  // Use refs for public form fetch tracking to avoid re-render loops
  const fetchingFormBySlugRef = useRef(false);
  const lastFetchedSlugRef = useRef<string | null>(null);
  const analyticsTrackedRef = useRef<Set<string>>(new Set());
  const qrBatchProcessingRef = useRef(false);

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
        }
        setForms([]);
        return;
      }
      const data = await res.json();
      setForms(data || []);
      
      // Auto-load analytics for all forms in the background
      if (data && data.length > 0) {
        for (const form of data) {
          // Load analytics for each form (don't await to prevent blocking)
          fetchAnalytics(form.id).catch(e => console.warn('Background analytics load failed for form', form.id, e));
        }
      }
      
      // Load existing QR codes and generate missing ones (with batching for performance)
      // Prevent concurrent batch processing
      if (qrBatchProcessingRef.current) {
        console.log('QR batch processing already in progress, skipping');
        return;
      }
      
      qrBatchProcessingRef.current = true;
      
      try {
        const newQrCodes = new Map();
        const formsNeedingQR = [];
        
        for (const form of (data || [])) {
          // If form has existing QR code data from database, use it
          if (form.qrCodeData) {
            newQrCodes.set(form.id, form.qrCodeData);
          }
          // Collect forms that need QR generation
          else {
            formsNeedingQR.push(form);
          }
        }
        
        // Generate QR codes in small batches of 2 to be very API-friendly
        const batchSize = 2;
        for (let i = 0; i < formsNeedingQR.length; i += batchSize) {
          const batch = formsNeedingQR.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async (form) => {
            try {
              const qrResponse = await fetch('/api/qrcodes', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  formId: form.id,
                  templateId: form.templateId,
                  slug: form.slug || `form-${form.id}`
                })
              });
              
              if (qrResponse.ok) {
                const qrResult = await qrResponse.json();
                newQrCodes.set(form.id, qrResult.qrCodeData);
              }
            } catch (error) {
              console.log(`Failed to generate QR for form ${form.id}:`, error);
            }
          }));
          
          // Longer delay between batches to be very API-friendly
          if (i + batchSize < formsNeedingQR.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // Use functional update to merge with current state safely
        setQrCodes(prev => {
          const merged = new Map(prev);
          for (const [key, value] of newQrCodes.entries()) {
            merged.set(key, value);
          }
          return merged;
        });
      } finally {
        qrBatchProcessingRef.current = false;
      }
    } catch (e) {
      console.error('fetch forms error', e);
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
        setCredClientSecret(data.clientSecret || '');
        setCredRefreshToken(data.refreshToken || '');
        setCredApiDomain(data.apiDomain || 'https://sign.zoho.com');
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
      clientSecret: credClientSecret.trim(),
      refreshToken: credRefreshToken.trim(),
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
      const isPublicForm = path !== '/' && !path.startsWith('/api') && !path.startsWith('/qr/');
      
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
      
      // For admin/landing pages, wait for auth check
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
    setLandingButtonText('Sign Now');
    setLandingCompanyName('');
    setLandingContactEmail('');
    setLandingContactPhone('');
    setLandingFooterText('');
    setLandingShowPoweredBy(true);
    // Clear accessibility errors
    setContrastWarning(null);
    setAltTextError(null);
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
    setLandingButtonText(lc.buttonText || 'Sign Now');
    setLandingCompanyName(lc.contact?.companyName || '');
    setLandingContactEmail(lc.contact?.email || '');
    setLandingContactPhone(lc.contact?.phone || '');
    setLandingFooterText(lc.footerText || '');
    setLandingShowPoweredBy(lc.showPoweredBy !== false);
    
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
    
    // Validate color contrast for accessibility (WCAG AA)
    const contrastValidation = validateContrast(landingPrimaryColor, landingBackgroundColor, 'AA', true);
    if (!contrastValidation.valid) {
      setError(`Color contrast issue: ${contrastValidation.suggestion}`);
      setDetailsTab('landing');
      return;
    }
    
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
    
    const formDef: FormDefinition = {
      id: editingId || crypto.randomUUID(),
      name: formName.trim(),
      slug: trimmedSlug,
      templateId: templateId.trim(),
      roleName: roleName.trim(),
      apiDomain: apiDomain.trim(),
      userId: userId || undefined,
      accessToken: sessionToken, // Required by database
      createdAt: editingId ? currentForm?.createdAt || Date.now() : Date.now(),
      // Include landing config if any values are set
      landingConfig: (landingHeadline || landingDescription || landingLogoUrl || landingLogoAlt || landingCompanyName || landingContactEmail || landingContactPhone || landingFooterText || landingPrimaryColor !== '#3B82F6' || landingBackgroundColor !== '#F8FAFC' || landingButtonText !== 'Sign Now' || !landingShowPoweredBy) ? {
        headline: landingHeadline || undefined,
        description: landingDescription || undefined,
        logoUrl: landingLogoUrl || undefined,
        logoAlt: landingLogoAlt || undefined,
        theme: (landingPrimaryColor !== '#3B82F6' || landingBackgroundColor !== '#F8FAFC') ? {
          primaryColor: landingPrimaryColor !== '#3B82F6' ? landingPrimaryColor : undefined,
          backgroundColor: landingBackgroundColor !== '#F8FAFC' ? landingBackgroundColor : undefined
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
    
    console.log('Saving form:', formDef);
    
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
      console.error('Save form error:', res.status, msg);
      if (res.status === 404) {
        setError('Forms API not implemented yet. Please contact administrator.');
      } else {
        setError(`Save failed: ${msg}`);
      }
      setLoading(false);
      return;
    }
    const saved = await res.json();
    let updated = editingId ? forms.map(f => f.id === editingId ? saved : f) : [...forms, saved];
    setForms(updated);
    
    // If we're viewing this form's details, also update currentForm with the latest data
    if (selectedFormId === (editingId || saved.id)) {
      setCurrentForm(saved);
    }
    
    clearForm();
    setLoading(false);
    setDetailsTab('landing'); // Stay on landing tab after save
  };

  const deleteForm = async (id: string) => {
    if (!sessionToken) return;
    if (confirm("Permanently delete this configuration?")) {
      await fetch(`/api/forms?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const updated = forms.filter(f => f.id !== id);
      setForms(updated);
    }
  };

  const runConnectionTest = async (form: FormDefinition) => {
    setTestingId(form.id);
    setTestResult(null);
    const res = await testZohoConnection(form, {
      clientId: credClientId,
      clientSecret: credClientSecret,
      refreshToken: credRefreshToken,
      apiDomain: credApiDomain,
      userId: userId || undefined
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
    
    console.log('=== SUBMISSION START ===');
    console.log('Current form:', currentForm);
    console.log('Signer data:', signer);
    
    const res = await triggerZohoSignTemplate(currentForm, signer, false, {
      userId: currentForm.userId
    });
    
    console.log('=== API RESPONSE ===');
    console.log('Full response:', JSON.stringify(res, null, 2));
    console.log('Success:', res.success);
    console.log('Request ID:', res.requestId);
    console.log('Signing URL:', res.signingUrl);
    console.log('=== END RESPONSE ===');
    
    if (res.success) {
      // Track successful submission
      trackAnalytics(currentForm.id, 'submit_success', { name: signer.name, email: signer.email });
      
      if (res.signingUrl) {
        console.log('=== REDIRECTING TO ZOHO SIGN ===');
        console.log('Redirecting to:', res.signingUrl);
        // Redirect user directly to the Zoho Sign form
        window.location.href = res.signingUrl;
        return; // Don't set loading to false, page is redirecting
      } else {
        console.warn('=== WARNING: NO SIGNING URL RETURNED ===');
        console.warn('This means the embed token API call may have failed.');
        console.warn('User will receive email link instead of direct redirect.');
        setSuccessData({ requestId: res.requestId!, signingUrl: undefined });
      }
    } else {
      // Track failed submission
      trackAnalytics(currentForm.id, 'submit_error', { name: signer.name, email: signer.email, error: res.error });
      
      console.log('=== SUBMISSION FAILED ===');
      console.log('Error:', res.error);
      setError(res.error || "Submission failed. Please try again.");
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
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          eventType,
          visitorEmail: data?.email,
          visitorName: data?.name,
          referrer: document.referrer || undefined,
          userAgent: navigator.userAgent,
          metadata: data?.error ? { error: data.error } : undefined
        })
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
        // Handle other errors by attempting to generate
        console.warn('QR fetch returned non-404 error, attempting to generate:', res.status);
        await generateQRCode(formId);
      }
    } catch (e) {
      console.error('Failed to fetch QR code:', e);
      // If fetch fails, try to generate
      await generateQRCode(formId);
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
    }
  };

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


  // If someone tries to access a form URL on the app subdomain, force redirect to canonical www URL
  useEffect(() => {
    if (routeContext.subdomain === 'app' && routeContext.isFormSlug && routeContext.formSlug) {
      const wwwUrl = buildFormUrl(routeContext.formSlug);
      window.location.replace(wwwUrl);
    }
  }, [routeContext]);

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

  // Auto-load analytics when admin dashboard is accessed
  useEffect(() => {
    if (view === ViewMode.ADMIN_DASHBOARD && sessionToken && forms.length > 0) {
      // Load analytics for all forms if not already loaded
      for (const form of forms) {
        if (!analytics.has(form.id)) {
          fetchAnalytics(form.id).catch(e => console.warn('Analytics auto-load failed for form', form.id, e));
        }
      }
    }
  }, [view, sessionToken, forms.length]);


  return (
    <div className={`min-h-screen font-sans ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Loading state for admin/landing pages (waiting for auth) */}
      {(!isRouteResolved || view === null) && view !== ViewMode.PUBLIC_FORM && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`${darkMode ? 'text-slate-400' : 'text-slate-400'} font-bold text-lg`}>Loading...</p>
          </div>
        </div>
      )}

      {/* Public form loading spinner removed - now using optimistic rendering */}

      {isRouteResolved && view === ViewMode.LANDING && (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
          <Header isLoggedIn={!!sessionToken} onLoginClick={() => setView(ViewMode.ADMIN_LOGIN)} />
          <main className="max-w-6xl mx-auto px-6 pt-16 pb-24">
            <section className="grid lg:grid-cols-2 gap-14 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs font-semibold uppercase tracking-wide">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Zoho Sign Apps
                </div>
                <div className="space-y-4">
                  <p className="text-sm text-slate-300 font-medium uppercase tracking-wider">SignFlow Pro</p>
                  <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                    Launch branded signing portals in minutes—not months.
                  </h1>
                  <p className="text-lg text-slate-300 leading-relaxed">
                    Connect Zoho Sign templates, publish public-facing forms with custom slugs, and capture signatures instantly. No engineering backlog required.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setView(ViewMode.ADMIN_LOGIN); }}
                    className="px-6 py-4 rounded-lg bg-white text-slate-900 font-bold text-sm uppercase tracking-wide shadow-lg hover:translate-y-[-1px] transition"
                  >
                    Start Free
                  </button>
                  <button
                    onClick={() => { window.location.hash = '#/admin/login'; setAuthMode('login'); setView(ViewMode.ADMIN_LOGIN); }}
                    className="px-6 py-4 rounded-lg border border-white/30 text-white font-bold text-sm uppercase tracking-wide hover:bg-white/10 transition"
                  >
                    Admin Login
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/5">
                    <p className="font-bold text-white mb-1">Embed-ready URLs</p>
                    <p className="leading-relaxed text-slate-400">Custom slugs per template. Drop links into any site or product.</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/5">
                    <p className="font-bold text-white mb-1">Account-level credentials</p>
                    <p className="leading-relaxed text-slate-400">Store Zoho OAuth credentials once, reuse across every form.</p>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute -top-10 -left-10 h-32 w-32 bg-blue-500/30 blur-3xl rounded-full"></div>
                <div className="absolute -bottom-16 -right-6 h-36 w-36 bg-emerald-500/20 blur-3xl rounded-full"></div>
                <div className="relative backdrop-blur-md bg-white/10 border border-white/10 rounded-3xl shadow-2xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-xl font-black">S</div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-300 font-semibold">Portal Preview</p>
                        <p className="text-lg font-black">NDA Agreement</p>
                      </div>
                    </div>
                    <span className="text-[11px] px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-500/30 font-black">LIVE</span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                      <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.687a1.5 1.5 0 112.121 2.122l-1.687 1.687M7.5 11.5l3 3m-7.957 4.957l5.338-1.312a2 2 0 001.01-.543l9.193-9.193a1.5 1.5 0 00-2.122-2.121l-9.193 9.193a2 2 0 00-.543 1.01l-1.312 5.338z" /></svg>
                      </div>
                      <div>
                        <p className="font-black">Signer 1 • john@acme.com</p>
                        <p className="text-xs text-slate-300">Template ready for dispatch</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl border border-white/10 bg-gradient-to-r from-blue-600/40 to-indigo-600/40">
                      <p className="text-sm font-semibold text-slate-100">Copy and share</p>
                      <p className="text-xs text-slate-200 font-mono">https://yourdomain.com/nda-proposal</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs text-center">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="font-black text-white text-lg">120</p>
                      <p className="text-slate-300">Sign requests</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="font-black text-white text-lg">99.2%</p>
                      <p className="text-slate-300">Deliverability</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="font-black text-white text-lg">12 min</p>
                      <p className="text-slate-300">Avg. completion</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      )}

      {view === ViewMode.ADMIN_LOGIN && (
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
      )}

      {view === ViewMode.ADMIN_DASHBOARD && (
        <div className="max-w-7xl mx-auto p-6 lg:p-12">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-5">
               <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-slate-700/30">S</div>
               <div>
                  <h1 className={`text-4xl font-bold tracking-tight ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>SignFlow Dashboard</h1>
                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-xs font-medium uppercase tracking-wider`}>Admin · Integrations</p>
               </div>
            </div>
            <div className="flex items-center gap-3">
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
              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'} p-8 rounded-lg shadow-lg sticky top-8`}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className={`font-bold text-2xl ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>{editingId ? "Edit" : "New"} Integration</h3>
                  {editingId && <button onClick={clearForm} className={`text-[10px] px-3 py-1.5 rounded-md font-bold border ${darkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>Cancel</button>}
                </div>

                <form onSubmit={saveForm} className={`space-y-6 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  <div className="space-y-4">
                    <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Display Name (e.g. NDA Agreement)" className={`w-full px-5 py-4 rounded-lg text-sm font-bold outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    <input required value={slug} onChange={e => setSlug(e.target.value)} placeholder="URL Slug (e.g. nda-agreement)" className={`w-full px-5 py-4 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    <div className="grid grid-cols-2 gap-4">
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
                    className={`${darkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-400'} p-5 rounded-xl border cursor-pointer transition-all hover:shadow-lg group`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-bold text-lg truncate ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{form.name}</h3>
                        <code className={`text-xs font-mono ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>/{form.slug}</code>
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
                    <div className="flex items-center gap-2 pt-2 border-t opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderColor: darkMode ? '#334155' : '#E2E8F0' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/${form.slug}`); alert('Link copied!'); }}
                        className={`text-[10px] px-2 py-1 rounded font-semibold ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                      >
                        Copy Link
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
                  <div className={`col-span-2 p-12 text-center rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>
                    <p className="font-semibold mb-2">No forms yet</p>
                    <p className="text-sm">Create your first form using the panel on the left</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Form Details Page */}
      {view === ViewMode.FORM_DETAILS && (() => {
        const selectedForm = getSelectedForm();
        if (!selectedForm) {
          return (
            <div className="max-w-4xl mx-auto p-6 lg:p-12 text-center">
              <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Form not found</p>
              <button onClick={() => { setView(ViewMode.ADMIN_DASHBOARD); window.location.hash = '#/admin/dashboard'; }} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">
                Back to Dashboard
              </button>
            </div>
          );
        }
        
        return (
        <div className="max-w-5xl mx-auto p-6 lg:p-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => { setView(ViewMode.ADMIN_DASHBOARD); window.location.hash = '#/admin/dashboard'; }}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>{selectedForm.name}</h1>
                <code className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>/{selectedForm.slug}</code>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a 
                href={`/${selectedForm.slug}`} 
                target="_blank" 
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                View Live →
              </a>
              <button 
                onClick={() => deleteForm(selectedForm.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${darkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50'}`}
              >
                Delete
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className={`flex gap-1 p-1 rounded-lg mb-6 ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
            {[
              { id: 'settings', label: 'Settings' },
              { id: 'landing', label: 'Landing Page' },
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="landing-primary-color" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Primary Color</label>
                        <div className="flex gap-2">
                          <input id="landing-primary-color-picker" type="color" value={landingPrimaryColor} onChange={e => {
                            setLandingPrimaryColor(e.target.value);
                            const validation = validateContrast(e.target.value, landingBackgroundColor, 'AA', true);
                            if (!validation.valid) {
                              setContrastWarning(validation.suggestion || '');
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Primary color picker" className="w-12 h-10 rounded cursor-pointer" />
                          <input id="landing-primary-color" value={landingPrimaryColor} onChange={e => {
                            setLandingPrimaryColor(e.target.value);
                            const validation = validateContrast(e.target.value, landingBackgroundColor, 'AA', true);
                            if (!validation.valid) {
                              setContrastWarning(validation.suggestion || '');
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Primary color hex value" className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="landing-background-color" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Background Color</label>
                        <div className="flex gap-2">
                          <input id="landing-background-color-picker" type="color" value={landingBackgroundColor} onChange={e => {
                            setLandingBackgroundColor(e.target.value);
                            const validation = validateContrast(landingPrimaryColor, e.target.value, 'AA', true);
                            if (!validation.valid) {
                              setContrastWarning(validation.suggestion || '');
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Background color picker" className="w-12 h-10 rounded cursor-pointer" />
                          <input id="landing-background-color" value={landingBackgroundColor} onChange={e => {
                            setLandingBackgroundColor(e.target.value);
                            const validation = validateContrast(landingPrimaryColor, e.target.value, 'AA', true);
                            if (!validation.valid) {
                              setContrastWarning(validation.suggestion || '');
                            } else {
                              setContrastWarning(null);
                            }
                          }} aria-label="Background color hex value" className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`} />
                        </div>
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
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 transition-colors text-sm"
                >
                  Regenerate
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
                  <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>QR code is being generated...</p>
                  <button 
                    onClick={() => regenerateQR(selectedForm.id)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    Generate QR Code
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Analytics Tab */}
          {detailsTab === 'analytics' && (
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-xl border`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className={`text-lg font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Analytics</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Track form visits and submissions</p>
                </div>
                <div className="flex items-center gap-3">
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{analytics.get(selectedForm.id).summary.totalVisits}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Visits</p>
                    </div>
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{analytics.get(selectedForm.id).summary.successfulSubmissions}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Submissions</p>
                    </div>
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {analytics.get(selectedForm.id).summary.totalVisits > 0 
                          ? Math.round((analytics.get(selectedForm.id).summary.successfulSubmissions / analytics.get(selectedForm.id).summary.totalVisits) * 100)
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
        );
      })()}

      {view === ViewMode.ADMIN_SETTINGS && (
        <div className="max-w-5xl mx-auto p-6 lg:p-12">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-lg shadow-slate-700/30">S</div>
              <div>
                <h1 className={`text-3xl font-black tracking-tight ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Account Settings</h1>
                <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-xs font-semibold uppercase tracking-[0.2em]`}>Credentials · Subscription</p>
              </div>
            </div>
            <div className="flex gap-2">
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
                <input value={credClientId} onChange={e => setCredClientId(e.target.value)} placeholder="Client ID" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                <input type="password" value={credClientSecret} onChange={e => setCredClientSecret(e.target.value)} placeholder="Client Secret" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                <input value={credRefreshToken} onChange={e => setCredRefreshToken(e.target.value)} placeholder="Refresh Token" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                <input value={credApiDomain} onChange={e => setCredApiDomain(e.target.value)} placeholder="API Domain (https://sign.zoho.com)" className={`w-full px-4 py-3 rounded-lg border text-sm font-mono ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
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
      )}

      {view === ViewMode.PUBLIC_FORM && (() => {
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
        const textColor = theme.textColor || (darkMode ? '#F1F5F9' : '#1E293B');
        const mutedColor = theme.mutedColor || (darkMode ? '#94A3B8' : '#64748B');
        
        return (
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
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
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
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
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
                        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>Full Name</label>
                        <input required name="signerName" placeholder="John Doe" autoFocus className="w-full px-4 py-3 rounded-lg outline-none focus:ring-2 font-medium text-base border" style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', borderColor: darkMode ? '#334155' : '#E2E8F0', color: textColor, '--tw-ring-color': `${primaryColor}50` } as React.CSSProperties} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>Email Address</label>
                        <input required name="signerEmail" type="email" placeholder="john@example.com" className="w-full px-4 py-3 rounded-lg outline-none focus:ring-2 font-medium text-base border" style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', borderColor: darkMode ? '#334155' : '#E2E8F0', color: textColor, '--tw-ring-color': `${primaryColor}50` } as React.CSSProperties} />
                      </div>
                      {error && (
                        <div className="p-3 text-xs font-medium rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                           {error}
                        </div>
                      )}
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
        );
      })()}

      {view === ViewMode.NOT_FOUND && (
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-xl">
            <h1 className="text-[10rem] font-black text-slate-100 leading-none">404</h1>
            <h2 className="text-4xl font-black text-slate-900 mb-6">Integration Portal Missing</h2>
            <a href="#/admin" className="inline-block px-10 py-4 bg-slate-900 rounded-full text-white font-black text-sm uppercase tracking-widest shadow-xl">Return to Safety</a>
          </div>
        </div>
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
