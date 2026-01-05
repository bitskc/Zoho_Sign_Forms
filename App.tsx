
import React, { useState, useEffect } from 'react';
import { ViewMode, FormDefinition, SignerData, UserCredentials, SubscriptionPlan } from './types';
import Header from './components/Header';
import { triggerZohoSignTemplate, testZohoConnection } from './services/zohoService';
import { supabase } from './services/supabaseClient';

// Extend window for ZohoSign SDK
declare global {
  interface Window {
    ZohoSign: any;
  }
}

const App: React.FC = () => {
  const getInitialView = () => {
    const hash = window.location.hash || '';
    const path = window.location.pathname || '/';
    const effective = hash || `#${path}`;
    
    if (effective.startsWith('#/f/')) {
      return ViewMode.PUBLIC_FORM;
    } else if (effective.startsWith('#/admin')) {
      return ViewMode.ADMIN_LOGIN;
    }
    return ViewMode.LANDING;
  };
  
  const [view, setView] = useState<ViewMode>(getInitialView());
  const [isRouteResolved, setIsRouteResolved] = useState(false);
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

  const fetchForms = async (token: string) => {
    const res = await fetch('/api/forms', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      setForms([]);
      return;
    }
    const data = await res.json();
    setForms(data || []);
  };

  const fetchFormBySlug = async (slugVal: string) => {
    try {
      const res = await fetch(`/api/forms?slug=${encodeURIComponent(slugVal)}`);
      if (!res.ok) {
        setView(ViewMode.NOT_FOUND);
        return;
      }
      const data = await res.json();
      setCurrentForm(data);
      setView(ViewMode.PUBLIC_FORM);
    } catch {
      setView(ViewMode.NOT_FOUND);
    }
  };

  const fetchCredentials = async (token: string) => {
    try {
      const res = await fetch('/api/credentials', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: UserCredentials = await res.json();
        setCredClientId(data.clientId || '');
        setCredClientSecret(data.clientSecret || '');
        setCredRefreshToken(data.refreshToken || '');
        setCredApiDomain(data.apiDomain || 'https://sign.zoho.com');
      }
    } catch (e) {
      console.error('fetch credentials error', e);
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
    await fetchCredentials(sessionToken);
  };

  const fetchSubscription = async (token: string) => {
    try {
      const res = await fetch('/api/subscription', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: SubscriptionPlan = await res.json();
        setSubscription(data);
      }
    } catch (e) {
      console.error('fetch subscription error', e);
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
    await fetchSubscription(sessionToken);
  };

  useEffect(() => {
    const resolveRoute = () => {
      const hash = window.location.hash || '';
      const path = window.location.pathname || '/';
      const effective = hash || `#${path}`;

      if (effective.startsWith('#/f/')) {
        const slugVal = effective.replace('#/f/', '').replace(/\/$/, '');
        const found = forms.find(f => f.slug === slugVal);
        if (found) {
          setCurrentForm(found);
          setView(ViewMode.PUBLIC_FORM);
        } else if (slugVal) {
          fetchFormBySlug(slugVal);
        } else {
          setView(ViewMode.NOT_FOUND);
        }
      } else if (effective.startsWith('#/admin/signup')) {
        setAuthMode('signup');
        setView(ViewMode.ADMIN_LOGIN);
        window.location.hash = '#/admin/signup';
      } else if (effective.startsWith('#/admin/login') || effective === '#/admin') {
        setAuthMode('login');
        setView(ViewMode.ADMIN_LOGIN);
        window.location.hash = '#/admin/login';
      } else if (effective.startsWith('#/admin/dashboard')) {
        setView(ViewMode.ADMIN_DASHBOARD);
      } else if (effective.startsWith('#/admin/settings')) {
        setView(ViewMode.ADMIN_SETTINGS);
      } else {
        if (hash !== '') {
          window.location.hash = '';
        }
        setView(ViewMode.LANDING);
      }
    };

    window.addEventListener('hashchange', resolveRoute);
    resolveRoute();
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionToken(data.session.access_token);
        setUserId(data.session.user.id);
        setAuth({ username: data.session.user.email || '', password: '' });
        
        const hash = window.location.hash || '';
        const path = window.location.pathname || '/';
        const effective = hash || `#${path}`;
        
        if (!effective.startsWith('#/f/')) {
          window.location.hash = '#/admin/dashboard';
          setView(ViewMode.ADMIN_DASHBOARD);
        }
        
        await Promise.all([
          fetchForms(data.session.access_token),
          fetchCredentials(data.session.access_token),
          fetchSubscription(data.session.access_token)
        ]);
      }
      setIsRouteResolved(true);
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
        setSessionToken(null);
        setUserId(null);
        setForms([]);
        const hash = window.location.hash;
        if (hash.startsWith('#/admin')) {
          window.location.hash = '';
          setView(ViewMode.LANDING);
        } else if (hash.startsWith('#/f/')) {
          setView(ViewMode.PUBLIC_FORM);
        } else {
          if (hash !== '') {
            window.location.hash = '';
          }
          setView(ViewMode.LANDING);
        }
      }
    });
    return () => window.removeEventListener('hashchange', resolveRoute);
  }, []);

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
  };

  const startEdit = (form: FormDefinition) => {
    setEditingId(form.id);
    setFormName(form.name);
    setTemplateId(form.templateId);
    setRoleName(form.roleName);
    setApiDomain(form.apiDomain || 'https://sign.zoho.com');
    setSlug(form.slug);
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      setError('Not authenticated');
      return;
    }
    const formDef: FormDefinition = {
      id: editingId || crypto.randomUUID(),
      name: formName.trim(),
      slug: slug.trim(),
      templateId: templateId.trim(),
      roleName: roleName.trim(),
      apiDomain: apiDomain.trim(),
      createdAt: editingId ? currentForm?.createdAt || Date.now() : Date.now()
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
      setError(`Save failed: ${msg}`);
      return;
    }
    const saved = await res.json();
    let updated = editingId ? forms.map(f => f.id === editingId ? saved : f) : [...forms, saved];
    setForms(updated);
    clearForm();
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
      if (res.signingUrl) {
        console.log('=== REDIRECTING ===');
        console.log('Redirecting to:', res.signingUrl);
        window.location.href = res.signingUrl;
      } else {
        console.log('=== NO SIGNING URL ===');
        console.log('Showing success screen instead');
        setSuccessData({ requestId: res.requestId!, signingUrl: res.signingUrl });
      }
    } else {
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

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className={`min-h-screen font-sans ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {!isRouteResolved ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`${darkMode ? 'text-slate-400' : 'text-slate-400'} font-bold text-lg`}>Loading...</p>
          </div>
        </div>
      ) : view === ViewMode.LANDING && (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
          <Header />
          <main className="max-w-6xl mx-auto px-6 pt-16 pb-24">
            <section className="grid lg:grid-cols-2 gap-14 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-[0.25em]">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Zoho Sign Apps
                </div>
                <div className="space-y-4">
                  <p className="text-sm text-slate-300 font-semibold uppercase tracking-[0.35em]">SignFlow Pro</p>
                  <h1 className="text-5xl lg:text-6xl font-black leading-tight">
                    Launch branded signing portals in minutes—not months.
                  </h1>
                  <p className="text-lg text-slate-300 leading-relaxed">
                    Connect Zoho Sign templates, publish public-facing forms with custom slugs, and capture signatures instantly. No engineering backlog required.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setView(ViewMode.ADMIN_LOGIN); }}
                    className="px-6 py-4 rounded-2xl bg-white text-slate-900 font-black text-sm uppercase tracking-[0.25em] shadow-lg hover:translate-y-[-1px] transition"
                  >
                    Start Free
                  </button>
                  <button
                    onClick={() => { window.location.hash = '#/admin/login'; setAuthMode('login'); setView(ViewMode.ADMIN_LOGIN); }}
                    className="px-6 py-4 rounded-2xl border border-white/30 text-white font-black text-sm uppercase tracking-[0.25em] hover:bg-white/10 transition"
                  >
                    Admin Login
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="font-black text-white mb-1">Embed-ready URLs</p>
                    <p className="leading-relaxed text-slate-400">Custom slugs per template. Drop links into any site or product.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="font-black text-white mb-1">Account-level credentials</p>
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
                      <p className="text-xs text-slate-200 font-mono">https://yourdomain.com/#/f/nda-proposal</p>
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
          <div className={`w-full max-w-md ${darkMode ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'} p-10 rounded-[3rem] shadow-2xl border`}>
            <div className="text-center mb-8 space-y-3">
              <div className={`inline-flex items-center justify-center w-20 h-20 ${darkMode ? 'bg-slate-800 text-white' : 'bg-blue-600 text-white'} rounded-[2rem] font-black text-4xl shadow-lg shadow-blue-500/30`}>S</div>
              <h1 className="text-3xl font-black tracking-tight">
                {authMode === 'login' ? 'Admin Login' : 'Create Admin Account'}
              </h1>
              <p className={`text-sm font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Mode: <span className={`${darkMode ? 'text-blue-300' : 'text-blue-600'} uppercase tracking-widest`}>{authMode}</span>
              </p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <input type="email" autoFocus className={`w-full px-6 py-4 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-3xl text-center font-bold text-md outline-none focus:ring-4 focus:ring-blue-500/10`} value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Email" />
              <input type="password" className={`w-full px-6 py-4 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-3xl text-center font-bold text-md outline-none focus:ring-4 focus:ring-blue-500/10`} value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" />
              {error && (
                <div className={`text-sm font-semibold rounded-2xl px-4 py-3 text-center ${darkMode ? 'text-red-300 bg-red-950 border border-red-900' : 'text-red-600 bg-red-50 border border-red-200'}`}>
                  {error}
                </div>
              )}
              <button disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-3xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Please wait…' : authMode === 'login' ? 'Access Dashboard' : 'Create Account'}
              </button>
              <div className="text-center text-xs text-slate-400">
                {authMode === 'login' ? (
                  <button type="button" onClick={() => { window.location.hash = '#/admin/signup'; setAuthMode('signup'); setError(null); }} className="underline font-bold">
                    Need an account? Sign up
                  </button>
                ) : (
                  <button type="button" onClick={() => { window.location.hash = '#/admin/login'; setAuthMode('login'); setError(null); }} className="underline font-bold">
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
               <div className="w-14 h-14 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-slate-700/30">S</div>
               <div>
                  <h1 className={`text-4xl font-black tracking-tight ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>SignFlow Dashboard</h1>
                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-xs font-semibold uppercase tracking-[0.2em]`}>Admin · Integrations</p>
               </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setDarkMode(!darkMode)} className={`px-4 py-2 rounded-lg border text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button onClick={() => { window.location.hash = '#/admin/settings'; setView(ViewMode.ADMIN_SETTINGS); }} className={`px-4 py-2 rounded-lg border text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Settings</button>
              <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className={`px-6 py-2.5 rounded-lg border text-xs font-black transition-all uppercase tracking-widest ${darkMode ? 'border-slate-700 text-slate-300 hover:text-red-400' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>Logout</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Form Editor */}
            <div className="lg:col-span-5">
              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'} p-8 rounded-2xl shadow-lg sticky top-8`}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className={`font-black text-2xl ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>{editingId ? "Edit" : "New"} Integration</h3>
                  {editingId && <button onClick={clearForm} className={`text-[10px] px-3 py-1.5 rounded-md font-black border ${darkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>Cancel</button>}
                </div>

                <form onSubmit={saveForm} className={`space-y-6 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  <div className="space-y-4">
                    <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Display Name (e.g. NDA Agreement)" className={`w-full px-5 py-4 rounded-lg text-sm font-bold outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    <div className="grid grid-cols-2 gap-4">
                      <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Zoho Template ID" className={`w-full px-5 py-4 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                      <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role (e.g. Signer 1)" className={`w-full px-5 py-4 rounded-lg text-sm font-bold outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                    </div>
                    <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="API Domain (e.g. https://sign.zoho.com)" className={`w-full px-5 py-4 rounded-lg text-sm font-mono outline-none border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                  </div>

                  <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} p-6 rounded-xl space-y-4`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-[11px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Zoho Credentials</label>
                      <span className={`text-[11px] font-black ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Managed at account level</span>
                    </div>
                    <p className={`text-[12px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Templates and roles are set per form. Client ID/Secret and Refresh Token are saved once per account below.
                    </p>
                  </div>

                  <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-lg font-black text-lg hover:bg-slate-800 transition-all shadow-lg">
                    {editingId ? "Update Integration" : "Create Integration"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-7 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className={`text-2xl font-black ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Your Forms</h2>
                <button onClick={() => { clearForm(); setEditingId(null); }} className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>+ New</button>
              </div>

              {testResult && (
                <div className={`mb-8 p-6 rounded-3xl border-2 flex items-start justify-between animate-in slide-in-from-top duration-300 ${testResult.success
                  ? (darkMode ? 'bg-green-950 border-green-900 text-green-200' : 'bg-green-50 border-green-100 text-green-700')
                  : (darkMode ? 'bg-red-950 border-red-900 text-red-200' : 'bg-red-50 border-red-100 text-red-700')}`}>
                  <div>
                    <p className="font-black text-sm mb-1">{testResult.success ? '✓ Connection Verified' : '✕ Connection Error'}</p>
                    <p className="text-xs opacity-80">{testResult.message}</p>
                    {testResult.hint && <p className="text-[10px] mt-2 font-bold italic">Tip: {testResult.hint}</p>}
                  </div>
                  <button onClick={() => setTestResult(null)} className={`${darkMode ? 'text-slate-400 hover:text-slate-200' : 'opacity-50 hover:opacity-100'}`}>✕</button>
                </div>
              )}

              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'} rounded-2xl shadow-sm overflow-hidden border`}>
                <table className="w-full text-left">
                  <thead className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50/50 border-slate-100'}`}>
                    <tr>
                      <th className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Portal Name</th>
                      <th className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Control</th>
                    </tr>
                  </thead>
                  <tbody className={`${darkMode ? 'divide-slate-800' : 'divide-slate-100'} divide-y`}>
                    {forms.map(form => (
                      <tr key={form.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50/50'}`}>
                        <td className="px-6 py-6">
                          <p className={`font-black text-lg mb-1 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{form.name}</p>
                          <div className="flex flex-wrap gap-2 mb-3">
                             <span className={`text-[10px] px-2 py-1 rounded font-bold ${darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-500'}`}>TEMPLATE: {form.templateId}</span>
                             <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-50 text-blue-600'}`}>{form.apiDomain.split('.').pop()}</span>
                             <span className="text-[10px] bg-slate-900 text-slate-200 px-2 py-1 rounded font-mono">Live</span>
                          </div>
                          <div className="flex items-center gap-2 group">
                             <code className={`text-[10px] font-bold px-2 py-1 rounded ${darkMode ? 'text-blue-200 bg-blue-900/40' : 'text-blue-600 bg-blue-50/50'}`}>/f/{form.slug}</code>
                             <button onClick={() => {
                                const url = `${window.location.origin}${window.location.pathname}#/f/${form.slug}`;
                                navigator.clipboard.writeText(url);
                                alert("Link copied to clipboard!");
                             }} className={`${darkMode ? 'text-slate-400 hover:text-blue-300' : 'text-slate-300 hover:text-blue-500'} p-1`}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => runConnectionTest(form)} disabled={testingId === form.id} className={`p-3 rounded-xl transition-all shadow-sm ${darkMode ? 'bg-green-900 text-green-200 hover:bg-green-600 hover:text-white' : 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white'}`}>
                               {testingId === form.id ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                            </button>
                            <button onClick={() => startEdit(form)} className={`p-3 rounded-xl transition-all shadow-sm ${darkMode ? 'bg-blue-900 text-blue-200 hover:bg-blue-600 hover:text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                            <button onClick={() => deleteForm(form.id)} className={`p-3 rounded-xl transition-all shadow-sm ${darkMode ? 'bg-red-900 text-red-200 hover:bg-red-600 hover:text-white' : 'bg-red-50 text-red-500 hover:bg-red-600 hover:text-white'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {forms.length === 0 && (
                      <tr><td colSpan={2} className="px-6 py-14 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">No active integrations found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      )}

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
              <button onClick={() => { window.location.hash = '#/admin/dashboard'; setView(ViewMode.ADMIN_DASHBOARD); }} className={`px-5 py-2 rounded-lg border text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Back to Dashboard</button>
              <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className={`px-5 py-2 rounded-lg border text-xs font-black transition-all uppercase tracking-widest ${darkMode ? 'border-slate-700 text-slate-300 hover:text-red-400' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>Logout</button>
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

      {view === ViewMode.PUBLIC_FORM && (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-xl">
            {!currentForm ? (
              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'} p-14 rounded-[2rem] shadow-2xl text-center`}>
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className={`${darkMode ? 'text-slate-400' : 'text-slate-400'} font-bold text-lg`}>Loading form...</p>
              </div>
            ) : !successData ? (
              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'} p-14 rounded-[2rem] shadow-2xl animate-in fade-in duration-700`}>
                <div className="text-center mb-12">
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-xl mb-8 border ${darkMode ? 'bg-slate-800 text-blue-200 border-slate-700' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </div>
                  <h1 className={`text-5xl font-black mb-4 tracking-tighter ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>{currentForm.name}</h1>
                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-400'} font-bold text-lg`}>Digital Signature Gateway</p>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                }} className="space-y-7">
                  <div className="space-y-3">
                    <label className={`text-[11px] font-black uppercase tracking-[0.3em] ml-2 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Full Name</label>
                    <input required name="signerName" placeholder="John Doe" className={`w-full px-8 py-6 rounded-xl outline-none focus:ring-8 focus:ring-blue-500/10 font-black text-lg border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                  </div>
                  <div className="space-y-3">
                    <label className={`text-[11px] font-black uppercase tracking-[0.3em] ml-2 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Email Address</label>
                    <input required name="signerEmail" type="email" placeholder="john@example.com" className={`w-full px-8 py-6 rounded-xl outline-none focus:ring-8 focus:ring-blue-500/10 font-black text-lg border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} />
                  </div>
                  {error && (
                    <div className={`p-6 text-sm font-bold rounded-3xl border-2 ${darkMode ? 'bg-red-950 text-red-200 border-red-900' : 'bg-red-50 text-red-600 border-red-100'}`}>
                       {error}
                    </div>
                  )}
                  <button disabled={loading} className="w-full bg-blue-600 text-white py-7 rounded-xl font-black text-2xl shadow-3xl shadow-blue-600/40 hover:bg-blue-700 transition-all active:scale-[0.98] mt-6 tracking-tight disabled:opacity-50">
                    {loading ? "Preparing Document..." : "Sign Now"}
                  </button>
                </form>
              </div>
            ) : (
              <div className={`${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'} p-20 rounded-[5rem] shadow-2xl text-center animate-in zoom-in duration-500`}>
                <div className={`w-32 h-32 rounded-[3rem] flex items-center justify-center mx-auto mb-12 shadow-inner border-2 animate-bounce ${darkMode ? 'bg-green-900 text-green-200 border-green-800' : 'bg-green-50 text-green-500 border-green-100'}`}>
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className={`text-5xl font-black mb-4 tracking-tighter ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>Portal Ready</h2>
                <p className={`${darkMode ? 'text-slate-400' : 'text-slate-400'} font-bold text-xl mb-14`}>Your agreement is prepared and waiting.</p>
                {successData.signingUrl ? (
                  <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black text-2xl shadow-3xl hover:bg-slate-800 transition-all active:scale-95 tracking-tight">Open Signature Interface</button>
                ) : (
                  <div className={`${darkMode ? 'bg-blue-900/30 text-blue-200 border border-blue-800' : 'bg-blue-50/50 text-blue-700 border-2 border-blue-100'} p-10 rounded-[3rem] font-black text-lg`}>
                    A secure link has been sent to your email.
                  </div>
                )}
                <button onClick={() => setSuccessData(null)} className={`mt-14 font-black uppercase text-sm tracking-[0.5em] transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-300 hover:text-slate-600'}`}>Go Back</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === ViewMode.NOT_FOUND && (
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-xl">
            <h1 className="text-[10rem] font-black text-slate-100 leading-none">404</h1>
            <h2 className="text-4xl font-black text-slate-900 mb-6">Integration Portal Missing</h2>
            <a href="#/admin" className="inline-block px-10 py-4 bg-slate-900 rounded-full text-white font-black text-sm uppercase tracking-widest shadow-xl">Return to Safety</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
