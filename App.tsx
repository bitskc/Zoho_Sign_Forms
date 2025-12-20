
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
      name: formName,
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
    if (confirm("Are you sure? This cannot be undone.")) {
      const updated = forms.filter(f => f.id !== id);
      setForms(updated);
      storage.saveForms(updated);
    }
  };

  const runConnectionTest = async (form: FormDefinition) => {
    setTestingId(form.id);
    setTestResult(null);
    const res = await testZohoConnection(form);
    
    let hintText = "";
    if (!res.success && res.error?.includes("No match found")) {
      hintText = "Verification failed with 'No match found'. Verify: 1. Template ID exists in this data center. 2. Role name matches the template exactly. 3. Domain matches your Zoho account (e.g., .eu vs .com).";
    }

    setTestResult({
      success: res.success,
      message: res.success ? `Success! Request Created: ${res.requestId}` : res.error || "Unknown Error",
      hint: hintText
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
      setError(res.error || "Submission failed.");
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
          <div className="w-full max-w-md bg-white p-10 rounded-[2rem] shadow-2xl border border-slate-200">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 text-white font-black text-2xl shadow-lg shadow-blue-500/20">S</div>
              <h1 className="text-2xl font-black text-slate-800">SignFlow Admin</h1>
              <p className="text-slate-400 text-sm mt-1">Authorized access only</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input 
                type="password" 
                autoFocus 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all" 
                value={passwordInput} 
                onChange={e => setPasswordInput(e.target.value)} 
                placeholder="Enter admin password" 
              />
              {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
              <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">Unlock Dashboard</button>
            </form>
          </div>
        </div>
      )}

      {view === ViewMode.ADMIN_DASHBOARD && (
        <div className="max-w-7xl mx-auto p-6 lg:p-12">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">SignFlow Pro</h1>
              <p className="text-slate-400 font-medium">Multi-tenant Zoho Sign Integration Portal</p>
            </div>
            <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className="px-5 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-400 hover:text-red-500 hover:border-red-100 transition-all">Logout Session</button>
          </div>

          {testResult && (
            <div className={`mb-10 p-8 rounded-[2rem] border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} animate-in slide-in-from-top duration-500 shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-black uppercase tracking-[0.2em] ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success ? 'API Response: 200 OK' : 'API Response: Error'}
                </span>
                <button onClick={() => setTestResult(null)} className="p-1 hover:bg-white rounded-full transition-colors">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className={`text-sm font-mono break-all leading-relaxed ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>{testResult.message}</p>
              {testResult.hint && (
                <div className="mt-4 p-4 bg-white/50 rounded-2xl border border-red-100/50">
                  <p className="text-xs text-red-600 leading-relaxed"><strong className="uppercase mr-2">Debugging Hint:</strong> {testResult.hint}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl sticky top-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-2xl text-blue-400">{editingId ? "Modify Form" : "Create Form"}</h3>
                  {editingId && (
                    <button onClick={clearForm} className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full font-bold transition-colors">NEW FORM</button>
                  )}
                </div>
                <form onSubmit={saveForm} className="space-y-5 text-slate-900">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Identity</label>
                     <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Form Display Name" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                     <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="Custom URL Slug (Optional)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                  </div>
                  
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Zoho Template Details</label>
                     <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Template ID (Long Number)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                     <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role Name (Case Sensitive!)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                  </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Client Credentials</label>
                     <input required type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Zoho Access Token" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                     <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="API Domain (sign.zoho.com)" className="w-full px-5 py-4 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/30 outline-none" />
                  </div>

                  <button className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95">
                    {editingId ? "Update Configuration" : "Deploy Integration"}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-200">
                        <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Active Integrations</th>
                        <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Management</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {forms.map(form => (
                        <tr key={form.id} className={`hover:bg-slate-50/50 transition-colors ${editingId === form.id ? 'bg-blue-50/50' : ''}`}>
                          <td className="px-8 py-7">
                            <p className="font-black text-slate-800 text-lg">{form.name}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                               <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-lg font-mono font-bold tracking-tight">TEMPLATE: {form.templateId}</span>
                               <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-black uppercase tracking-tighter">ROLE: {form.roleName}</span>
                               <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-1 rounded-lg font-mono truncate max-w-[120px]">{form.apiDomain}</span>
                            </div>
                            <div className="mt-3 flex items-center gap-2 group">
                               <code className="text-[10px] text-slate-300 font-bold tracking-wider uppercase group-hover:text-blue-400 transition-colors">PUBLIC URL: /f/{form.slug}</code>
                               <button 
                                  onClick={() => {
                                    const url = `${window.location.origin}${window.location.pathname}#/f/${form.slug}`;
                                    navigator.clipboard.writeText(url);
                                    alert("Public link copied to clipboard!");
                                  }}
                                  className="text-slate-300 hover:text-blue-600 transition-colors"
                               >
                                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                               </button>
                            </div>
                          </td>
                          <td className="px-8 py-7">
                            <div className="flex items-center justify-end gap-3">
                              <button 
                                disabled={testingId === form.id}
                                onClick={() => runConnectionTest(form)}
                                className={`p-3 rounded-2xl transition-all shadow-sm ${testingId === form.id ? 'bg-slate-200 animate-pulse' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                                title="Run Connection Test"
                              >
                                {testingId === form.id ? (
                                   <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                )}
                              </button>
                              <button onClick={() => startEdit(form)} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 shadow-sm transition-all" title="Edit Configuration">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => deleteForm(form.id)} className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 shadow-sm transition-all" title="Delete Integration">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {forms.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-8 py-32 text-center text-slate-300">
                             <div className="max-w-xs mx-auto">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                  <svg className="w-8 h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <p className="font-black uppercase text-xs tracking-widest text-slate-400">No Integrations Active</p>
                                <p className="text-sm mt-2 text-slate-400">Create your first Zoho Sign template form using the dashboard sidebar.</p>
                             </div>
                          </td>
                        </tr>
                      )}
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
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-200">
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-black text-slate-900 mb-2">{currentForm.name}</h1>
                  <p className="text-slate-400 font-medium">Please enter your details to begin signing.</p>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                    <input required name="signerName" placeholder="As it should appear on document" className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                    <input required name="signerEmail" type="email" placeholder="Verification will be sent here" className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                  {error && (
                    <div className="p-5 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100 leading-relaxed">
                      {error}
                      <p className="mt-2 text-[10px] opacity-60 italic font-medium">Admin: Check your Role Name and Token status.</p>
                    </div>
                  )}
                  <button disabled={loading} className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black text-xl shadow-2xl shadow-blue-600/30 disabled:opacity-50 hover:bg-blue-700 transition-all active:scale-[0.98]">
                    {loading ? (
                      <div className="flex items-center justify-center gap-3">
                        <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        <span>Processing...</span>
                      </div>
                    ) : "Begin Signature"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white p-16 rounded-[3rem] shadow-2xl text-center border border-slate-200 animate-in zoom-in duration-500">
                <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner shadow-green-200">
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Document Ready</h2>
                <p className="text-slate-500 font-medium mb-10">Verification successful. Click below to start signing.</p>
                {successData.signingUrl ? (
                  <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black text-xl shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all">Open Signature Portal</button>
                ) : (
                  <div className="bg-blue-50 p-6 rounded-2xl text-blue-800 font-bold text-sm leading-relaxed border border-blue-100">
                    A secure signing invitation has been dispatched to your email address. Please check your inbox.
                  </div>
                )}
                <button onClick={() => setSuccessData(null)} className="mt-10 text-slate-300 font-black uppercase text-xs tracking-[0.3em] hover:text-slate-500 transition-colors">Start New Entry</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === ViewMode.NOT_FOUND && (
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-md">
            <h1 className="text-9xl font-black text-slate-100 mb-4">404</h1>
            <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Access Denied</h2>
            <p className="text-slate-400 font-medium mb-8">This form URL is either invalid or has been decommissioned by the administrator.</p>
            <a href="#/admin" className="inline-block px-8 py-3 bg-slate-200 rounded-full text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-300 transition-all">Return to Dashboard</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
