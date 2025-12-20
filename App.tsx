
import React, { useState, useEffect } from 'react';
import { ViewMode, FormDefinition, ZohoConfig, SignerData } from './types';
import { storage } from './services/storageService';
import { triggerZohoSignTemplate, testZohoConnection } from './services/zohoService';

// Extend window for ZohoSign SDK
declare global {
  interface Window {
    ZohoSign: any;
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.PUBLIC_FORM);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [config, setConfig] = useState<ZohoConfig>(storage.getConfig());
  const [currentForm, setCurrentForm] = useState<FormDefinition | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{requestId: string, signingUrl?: string} | null>(null);
  
  // Test states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{success: boolean, message: string, hint?: string} | null>(null);

  // Form editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [roleName, setRoleName] = useState('Signer 1');
  const [accessToken, setAccessToken] = useState('');
  const [apiDomain, setApiDomain] = useState('https://sign.zoho.com');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/f/')) {
        const slugVal = hash.replace('#/f/', '');
        const allForms = storage.getForms();
        const found = allForms.find(f => f.slug === slugVal);
        if (found) {
          setCurrentForm(found);
          setView(ViewMode.PUBLIC_FORM);
        } else {
          setView(ViewMode.NOT_FOUND);
        }
      } else if (hash === '#/admin') {
        setView(ViewMode.ADMIN_LOGIN);
      } else {
        setView(ViewMode.ADMIN_LOGIN);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    setForms(storage.getForms());
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === config.adminPassword) {
      setView(ViewMode.ADMIN_DASHBOARD);
      setError(null);
    } else {
      setError("Incorrect password");
    }
  };

  const clearForm = () => {
    setEditingId(null);
    setFormName('');
    setTemplateId('');
    setRoleName('Signer 1');
    setAccessToken('');
    setApiDomain('https://sign.zoho.com');
    setSlug('');
  };

  const startEdit = (form: FormDefinition) => {
    setEditingId(form.id);
    setFormName(form.name);
    setTemplateId(form.templateId);
    setRoleName(form.roleName);
    setAccessToken(form.accessToken);
    setApiDomain(form.apiDomain);
    setSlug(form.slug);
  };

  const saveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const newForm: FormDefinition = {
      id: editingId || crypto.randomUUID(),
      name: formName.trim(),
      templateId: templateId.trim(),
      roleName: roleName.trim() || "Signer 1",
      accessToken: accessToken.trim(),
      apiDomain: apiDomain.trim() || 'https://sign.zoho.com',
      slug: slug.trim() || formName.toLowerCase().replace(/\s+/g, '-'),
      createdAt: editingId ? (forms.find(f => f.id === editingId)?.createdAt || Date.now()) : Date.now()
    };
    let updated = editingId ? forms.map(f => f.id === editingId ? newForm : f) : [...forms, newForm];
    setForms(updated);
    storage.saveForms(updated);
    clearForm();
  };

  const deleteForm = (id: string) => {
    if (confirm("Permanently delete this configuration?")) {
      const updated = forms.filter(f => f.id !== id);
      setForms(updated);
      storage.saveForms(updated);
    }
  };

  const runConnectionTest = async (form: FormDefinition) => {
    setTestingId(form.id);
    setTestResult(null);
    const res = await testZohoConnection(form);
    
    setTestResult({
      success: res.success,
      message: res.success ? `Success! Request Created: ${res.requestId}` : res.error || "Unknown Connection Error",
      // If the backend sent a debug_hint in the error string or as a specific property
      hint: !res.success && res.error?.includes("No match found") ? 
        "Verify your Role Name matches exactly (case-sensitive) and that your API domain matches your account region (.com, .eu, etc)." : undefined
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
      setError(res.error || "Zoho API rejected the request.");
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
          <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-200">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-[1.25rem] mb-6 text-white font-black text-3xl shadow-xl shadow-blue-500/20">S</div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">SignFlow Admin</h1>
              <p className="text-slate-400 font-medium mt-2">Multi-tenant management portal</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input 
                type="password" 
                autoFocus 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-center font-bold" 
                value={passwordInput} 
                onChange={e => setPasswordInput(e.target.value)} 
                placeholder="Admin Password" 
              />
              {error && <p className="text-red-500 text-sm font-bold text-center animate-shake">{error}</p>}
              <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95">Unlock Dashboard</button>
            </form>
          </div>
        </div>
      )}

      {view === ViewMode.ADMIN_DASHBOARD && (
        <div className="max-w-7xl mx-auto p-6 lg:p-12">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/20">S</div>
               <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">Dashboard</h1>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">System Operational</p>
               </div>
            </div>
            <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className="px-6 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-400 hover:text-red-500 hover:border-red-100 transition-all">End Session</button>
          </div>

          {testResult && (
            <div className={`mb-10 p-8 rounded-[2rem] border-2 ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} animate-in slide-in-from-top duration-500 shadow-xl shadow-slate-200/50`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${testResult.success ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'}`}>
                      {testResult.success ? '✓' : '!'}
                   </div>
                   <span className={`text-sm font-black uppercase tracking-widest ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    Test Result: {testResult.success ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <button onClick={() => setTestResult(null)} className="p-2 hover:bg-white rounded-full transition-colors group">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className={`text-sm font-mono break-all p-4 bg-white/50 rounded-xl leading-relaxed ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>{testResult.message}</p>
              {testResult.hint && (
                <div className="mt-4 flex gap-3">
                  <div className="flex-shrink-0 text-red-400 mt-1">💡</div>
                  <p className="text-xs text-red-600/80 leading-relaxed font-medium">
                    <strong className="uppercase">Debugging Hint:</strong> {testResult.hint}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-2xl text-blue-400">{editingId ? "Modify" : "Create"} Form</h3>
                  {editingId && (
                    <button onClick={clearForm} className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full font-black tracking-widest transition-colors">RESET</button>
                  )}
                </div>
                <form onSubmit={saveForm} className="space-y-5 text-slate-900">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Configuration Name</label>
                     <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Acme Corp Contract" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none transition-shadow" />
                  </div>
                  
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Zoho Template Settings</label>
                     <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Template ID (from Zoho URL)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                     <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role Name (e.g. Client)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                  </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Target Account Credentials</label>
                     <input required type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Client Access Token" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                     <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="Domain (e.g. sign.zoho.eu)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                  </div>

                  <button className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95 text-lg">
                    {editingId ? "Save Changes" : "Deploy Integration"}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Integrations</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {forms.map(form => (
                        <tr key={form.id} className={`hover:bg-slate-50 transition-colors group ${editingId === form.id ? 'bg-blue-50/50' : ''}`}>
                          <td className="px-8 py-8">
                            <div className="flex items-start justify-between">
                               <div>
                                  <p className="font-black text-slate-800 text-xl tracking-tight">{form.name}</p>
                                  <div className="flex flex-wrap gap-2 mt-3">
                                     <span className="text-[10px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg font-bold tracking-tight">ID: {form.templateId}</span>
                                     <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-black uppercase tracking-tighter">ROLE: {form.roleName}</span>
                                     <span className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg font-mono truncate max-w-[140px]">{form.apiDomain}</span>
                                  </div>
                               </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-3">
                               <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Public Endpoint</span>
                               <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                                  <code className="text-[10px] text-blue-500 font-bold">/f/{form.slug}</code>
                                  <button 
                                    onClick={() => {
                                      const url = `${window.location.origin}${window.location.pathname}#/f/${form.slug}`;
                                      navigator.clipboard.writeText(url);
                                      alert("Copied!");
                                    }}
                                    className="text-slate-300 hover:text-blue-600 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                  </button>
                               </div>
                            </div>
                          </td>
                          <td className="px-8 py-8">
                            <div className="flex items-center justify-end gap-3">
                              <button 
                                disabled={testingId === form.id}
                                onClick={() => runConnectionTest(form)}
                                className={`p-4 rounded-2xl transition-all shadow-sm ${testingId === form.id ? 'bg-slate-200 animate-pulse' : 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white'}`}
                                title="Run Connection Test"
                              >
                                {testingId === form.id ? (
                                   <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                )}
                              </button>
                              <button onClick={() => startEdit(form)} className="p-4 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white shadow-sm transition-all" title="Edit">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => deleteForm(form.id)} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white shadow-sm transition-all" title="Delete">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === ViewMode.PUBLIC_FORM && currentForm && (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-lg">
            {!successData ? (
              <div className="bg-white p-12 rounded-[3.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100">
                <div className="text-center mb-10">
                  <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">{currentForm.name}</h1>
                  <p className="text-slate-400 font-medium">Please provide your details to securely sign.</p>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Full Name</label>
                    <input required name="signerName" placeholder="Recipient Name" className="w-full px-7 py-5 bg-slate-50 border border-slate-100 rounded-[1.75rem] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Email Address</label>
                    <input required name="signerEmail" type="email" placeholder="example@email.com" className="w-full px-7 py-5 bg-slate-50 border border-slate-100 rounded-[1.75rem] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium" />
                  </div>
                  {error && (
                    <div className="p-6 bg-red-50 text-red-600 text-[11px] font-bold rounded-2xl border border-red-100 leading-relaxed shadow-sm">
                      <div className="flex gap-2 items-start">
                         <span className="text-sm">⚠️</span>
                         <span>{error}</span>
                      </div>
                      <p className="mt-3 text-[9px] opacity-70 uppercase tracking-tighter">System ID: {currentForm.templateId}</p>
                    </div>
                  )}
                  <button disabled={loading} className="w-full bg-blue-600 text-white py-6 rounded-[1.75rem] font-black text-xl shadow-2xl shadow-blue-600/30 disabled:opacity-50 hover:bg-blue-700 transition-all active:scale-[0.98] mt-4">
                    {loading ? (
                      <div className="flex items-center justify-center gap-3">
                        <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        <span>Authenticating...</span>
                      </div>
                    ) : "Verify & Sign"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white p-16 rounded-[4rem] shadow-2xl text-center border border-slate-100 animate-in zoom-in duration-500">
                <div className="w-28 h-28 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner border border-green-100/50">
                  <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">Identity Verified</h2>
                <p className="text-slate-400 font-medium mb-12">The digital signature portal is ready for your entry.</p>
                {successData.signingUrl ? (
                  <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black text-xl shadow-2xl shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95">Launch Zoho Sign</button>
                ) : (
                  <div className="bg-blue-50/50 p-8 rounded-3xl text-blue-700 font-bold text-sm leading-relaxed border border-blue-100">
                    A secure signature invite has been dispatched to your mailbox. Please complete the signing process there.
                  </div>
                )}
                <button onClick={() => setSuccessData(null)} className="mt-12 text-slate-300 font-black uppercase text-xs tracking-[0.4em] hover:text-slate-500 transition-colors">Start Over</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === ViewMode.NOT_FOUND && (
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-md animate-pulse">
            <h1 className="text-[12rem] font-black text-slate-100 mb-0 leading-none">?</h1>
            <h2 className="text-3xl font-black text-slate-800 mb-3 tracking-tighter">Endpoint Revoked</h2>
            <p className="text-slate-400 font-medium mb-10">This form integration has been archived or the URL has changed.</p>
            <a href="#/admin" className="inline-block px-10 py-4 bg-slate-900 rounded-full text-white font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">System Dashboard</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
