
import React, { useState, useEffect } from 'react';
import { ViewMode, FormDefinition, SignerData } from './types';
import { triggerZohoSignTemplate, testZohoConnection } from './services/zohoService';
import { supabase } from './services/supabaseClient';

// Extend window for ZohoSign SDK
declare global {
  interface Window {
    ZohoSign: any;
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.PUBLIC_FORM);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [auth, setAuth] = useState<{username: string; password: string} | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [currentForm, setCurrentForm] = useState<FormDefinition | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{requestId: string, signingUrl?: string} | null>(null);

  // Test/Helper states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{success: boolean, message: string, hint?: string} | null>(null);

  // Form editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [roleName, setRoleName] = useState('Signer 1');
  const [accessToken, setAccessToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiDomain, setApiDomain] = useState('https://sign.zoho.com');
  const [slug, setSlug] = useState('');

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

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/f/')) {
        const slugVal = hash.replace('#/f/', '');
        const found = forms.find(f => f.slug === slugVal);
        if (found) {
          setCurrentForm(found);
          setView(ViewMode.PUBLIC_FORM);
        } else {
          fetchFormBySlug(slugVal);
        }
      } else if (hash === '#/admin/signup') {
        setAuthMode('signup');
        setView(ViewMode.ADMIN_LOGIN);
      } else if (hash === '#/admin/login' || hash === '#/admin') {
        setAuthMode('login');
        setView(ViewMode.ADMIN_LOGIN);
      } else if (hash === '#/admin/dashboard') {
        setView(ViewMode.ADMIN_DASHBOARD);
      } else {
        setView(ViewMode.ADMIN_LOGIN);
        window.location.hash = '#/admin/login';
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionToken(data.session.access_token);
        setAuth({ username: data.session.user.email || '', password: '' });
        window.location.hash = '#/admin/dashboard';
        setView(ViewMode.ADMIN_DASHBOARD);
        await fetchForms(data.session.access_token);
      }
    };
    init();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        setSessionToken(session.access_token);
        setAuth({ username: session.user.email || '', password: '' });
        await fetchForms(session.access_token);
      } else {
        setSessionToken(null);
        setForms([]);
        setView(ViewMode.ADMIN_LOGIN);
      }
    });
    return () => window.removeEventListener('hashchange', handleHashChange);
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
        setAuth({ username: usernameInput, password: '' });
        window.location.hash = '#/admin/dashboard';
        setView(ViewMode.ADMIN_DASHBOARD);
        await fetchForms(data.session.access_token);
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
        setAuth({ username: usernameInput, password: '' });
        window.location.hash = '#/admin/dashboard';
        setView(ViewMode.ADMIN_DASHBOARD);
        await fetchForms(data.session.access_token);
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
    setAccessToken('');
    setClientId('');
    setClientSecret('');
    setApiDomain('https://sign.zoho.com');
    setSlug('');
  };

  const startEdit = (form: FormDefinition) => {
    setEditingId(form.id);
    setFormName(form.name);
    setTemplateId(form.templateId);
    setRoleName(form.roleName);
    setAccessToken(form.accessToken || '');
    setClientId(form.clientId || '');
    setClientSecret(form.clientSecret || '');
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
      accessToken: accessToken.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
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
    const res = await testZohoConnection(form);
    
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
    const res = await triggerZohoSignTemplate(currentForm, signer);
    if (res.success) {
      setSuccessData({ requestId: res.requestId!, signingUrl: res.signingUrl });
    } else {
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

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {view === ViewMode.ADMIN_LOGIN && (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-200">
            <div className="text-center mb-8 space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-[2rem] text-white font-black text-4xl shadow-lg shadow-blue-500/30">S</div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                {authMode === 'login' ? 'Admin Login' : 'Create Admin Account'}
              </h1>
              <p className="text-sm text-slate-500 font-semibold">
                Mode: <span className="text-blue-600 uppercase tracking-widest">{authMode}</span>
              </p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <input type="email" autoFocus className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-center font-bold text-md outline-none focus:ring-4 focus:ring-blue-500/10" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Email" />
              <input type="password" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-center font-bold text-md outline-none focus:ring-4 focus:ring-blue-500/10" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" />
              {error && (
                <div className="text-red-600 text-sm font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-center">
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
               <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-blue-500/20">S</div>
               <div>
                  <h1 className="text-4xl font-black text-slate-900 tracking-tighter">SignFlow Dashboard</h1>
                  <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">OAuth 2.0 Management</p>
               </div>
            </div>
            <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className="px-6 py-2.5 rounded-full border border-slate-200 text-xs font-black text-slate-400 hover:text-red-500 transition-all uppercase tracking-widest">Logout</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Form Editor */}
            <div className="lg:col-span-5">
              <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl sticky top-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-2xl text-blue-400">{editingId ? "Edit" : "New"} Integration</h3>
                  {editingId && <button onClick={clearForm} className="text-[10px] bg-white/10 px-3 py-1.5 rounded-full font-black">CANCEL</button>}
                </div>

                <form onSubmit={saveForm} className="space-y-6 text-slate-900">
                  <div className="space-y-4">
                    <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Display Name (e.g. NDA Agreement)" className="w-full px-5 py-4 rounded-2xl text-sm font-bold outline-none" />
                    <div className="grid grid-cols-2 gap-4">
                      <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Zoho Template ID" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                      <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role (e.g. Signer 1)" className="w-full px-5 py-4 rounded-2xl text-sm font-bold outline-none" />
                    </div>
                    <input required value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Refresh Token" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none bg-slate-50" />
                    <div className="grid grid-cols-2 gap-4">
                      <input required value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Zoho Client ID" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                      <input required value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Zoho Client Secret" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="API Domain (e.g. https://sign.zoho.com)" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                  </div>

                  <div className="bg-slate-800/50 p-6 rounded-[2rem] space-y-4 border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Zoho Credentials</label>
                      <span className="text-[10px] font-black text-white/50">Access Token only</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Paste your permanent Zoho Sign access token. No OAuth exchange required.
                    </p>
                  </div>

                  <select value={apiDomain} onChange={e => setApiDomain(e.target.value)} className="w-full px-5 py-4 rounded-2xl text-sm font-bold outline-none bg-white appearance-none">
                    <option value="https://sign.zoho.com">United States (.com)</option>
                    <option value="https://sign.zoho.eu">Europe (.eu)</option>
                    <option value="https://sign.zoho.in">India (.in)</option>
                    <option value="https://sign.zoho.com.au">Australia (.com.au)</option>
                    <option value="https://sign.zoho.jp">Japan (.jp)</option>
                  </select>

                  <button className="w-full bg-blue-600 text-white font-black py-5 rounded-[1.5rem] hover:bg-blue-500 transition-all shadow-xl">
                    {editingId ? "Update Integration" : "Create Integration"}
                  </button>
                </form>
              </div>
            </div>

            {/* Forms List */}
            <div className="lg:col-span-7">
              {testResult && (
                <div className={`mb-8 p-6 rounded-3xl border-2 ${testResult.success ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'} flex items-start justify-between animate-in slide-in-from-top duration-300`}>
                  <div>
                    <p className="font-black text-sm mb-1">{testResult.success ? '✓ Connection Verified' : '✕ Connection Error'}</p>
                    <p className="text-xs opacity-80">{testResult.message}</p>
                    {testResult.hint && <p className="text-[10px] mt-2 font-bold italic">Tip: {testResult.hint}</p>}
                  </div>
                  <button onClick={() => setTestResult(null)} className="opacity-50 hover:opacity-100">✕</button>
                </div>
              )}

              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Portal Name</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {forms.map(form => (
                      <tr key={form.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-8">
                          <p className="font-black text-slate-800 text-xl mb-1">{form.name}</p>
                          <div className="flex flex-wrap gap-2 mb-4">
                             <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">TEMPLATE: {form.templateId}</span>
                             <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold uppercase">{form.apiDomain.split('.').pop()}</span>
                             <span className="text-[9px] bg-slate-900 text-slate-400 px-2 py-1 rounded font-mono">OAuth Active</span>
                          </div>
                          <div className="flex items-center gap-2 group">
                             <code className="text-[10px] text-blue-600 font-bold bg-blue-50/50 px-2 py-1 rounded">/f/{form.slug}</code>
                             <button onClick={() => {
                                const url = `${window.location.origin}${window.location.pathname}#/f/${form.slug}`;
                                navigator.clipboard.writeText(url);
                                alert("Link copied to clipboard!");
                             }} className="text-slate-300 hover:text-blue-500 p-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                          </div>
                        </td>
                        <td className="px-8 py-8">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => runConnectionTest(form)} disabled={testingId === form.id} className="p-3 bg-green-50 text-green-600 rounded-2xl hover:bg-green-600 hover:text-white transition-all shadow-sm">
                               {testingId === form.id ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                            </button>
                            <button onClick={() => startEdit(form)} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                            <button onClick={() => deleteForm(form.id)} className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {forms.length === 0 && (
                      <tr><td colSpan={2} className="px-8 py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">No active integrations found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === ViewMode.PUBLIC_FORM && currentForm && (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-xl">
            {!successData ? (
              <div className="bg-white p-14 rounded-[4rem] shadow-2xl border border-slate-100 animate-in fade-in duration-700">
                <div className="text-center mb-12">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl mb-8 border border-blue-100">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </div>
                  <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">{currentForm.name}</h1>
                  <p className="text-slate-400 font-bold text-lg">Digital Signature Gateway</p>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                }} className="space-y-7">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Full Name</label>
                    <input required name="signerName" placeholder="John Doe" className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none focus:ring-8 focus:ring-blue-500/10 font-black text-lg" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Email Address</label>
                    <input required name="signerEmail" type="email" placeholder="john@example.com" className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none focus:ring-8 focus:ring-blue-500/10 font-black text-lg" />
                  </div>
                  {error && (
                    <div className="p-6 bg-red-50 text-red-600 text-sm font-bold rounded-3xl border-2 border-red-100">
                       {error}
                    </div>
                  )}
                  <button disabled={loading} className="w-full bg-blue-600 text-white py-7 rounded-[2rem] font-black text-2xl shadow-3xl shadow-blue-600/40 hover:bg-blue-700 transition-all active:scale-[0.98] mt-6 tracking-tight disabled:opacity-50">
                    {loading ? "Preparing Document..." : "Sign Now"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white p-20 rounded-[5rem] shadow-2xl text-center border border-slate-100 animate-in zoom-in duration-500">
                <div className="w-32 h-32 bg-green-50 text-green-500 rounded-[3rem] flex items-center justify-center mx-auto mb-12 shadow-inner border-2 border-green-100 animate-bounce">
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">Portal Ready</h2>
                <p className="text-slate-400 font-bold text-xl mb-14">Your agreement is prepared and waiting.</p>
                {successData.signingUrl ? (
                  <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black text-2xl shadow-3xl hover:bg-slate-800 transition-all active:scale-95 tracking-tight">Open Signature Interface</button>
                ) : (
                  <div className="bg-blue-50/50 p-10 rounded-[3rem] text-blue-700 font-black text-lg border-2 border-blue-100">
                    A secure link has been sent to your email.
                  </div>
                )}
                <button onClick={() => setSuccessData(null)} className="mt-14 text-slate-300 font-black uppercase text-sm tracking-[0.5em] hover:text-slate-600 transition-colors">Go Back</button>
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
