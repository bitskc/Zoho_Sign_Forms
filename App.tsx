
import React, { useState, useEffect } from 'react';
import { ViewMode, FormDefinition, ZohoConfig, SignerData } from './types';
import { storage } from './services/storageService';
import { triggerZohoSignTemplate, testZohoConnection, exchangeToken } from './services/zohoService';

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
  
  // Test/Helper states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{success: boolean, message: string, hint?: string} | null>(null);
  const [helperVisible, setHelperVisible] = useState(false);
  const [helperGrant, setHelperGrant] = useState('');
  const [helperLoading, setHelperLoading] = useState(false);

  // Form editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [roleName, setRoleName] = useState('Signer 1');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
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

  const handleExchange = async () => {
    if (!clientId || !clientSecret || !helperGrant) {
      alert("Need Client ID, Secret, and Grant Token (Code) to exchange.");
      return;
    }
    setHelperLoading(true);
    const res = await exchangeToken(clientId, clientSecret, helperGrant, apiDomain);
    setHelperLoading(false);

    if (res.refresh_token) {
      setRefreshToken(res.refresh_token);
      alert("Refresh Token Received and Updated in Form!");
    } else {
      alert(`Exchange Failed: ${res.error || 'Check your credentials and region.'}`);
    }
  };

  const clearForm = () => {
    setEditingId(null);
    setFormName('');
    setTemplateId('');
    setRoleName('Signer 1');
    setClientId('');
    setClientSecret('');
    setRefreshToken('');
    setApiDomain('https://sign.zoho.com');
    setSlug('');
  };

  const startEdit = (form: FormDefinition) => {
    setEditingId(form.id);
    setFormName(form.name);
    setTemplateId(form.templateId);
    setRoleName(form.roleName);
    setClientId(form.clientId);
    setClientSecret(form.clientSecret);
    setRefreshToken(form.refreshToken);
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
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      refreshToken: refreshToken.trim(),
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
      message: res.success ? `Success! Handshake Verified.` : res.error || "Unknown Connection Error",
      hint: !res.success ? "Tip: Role Name is case-sensitive. 'Signer 1' is not 'signer 1'." : undefined
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
          <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-200">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-[2rem] mb-6 text-white font-black text-4xl">S</div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">SignFlow Pro Login</h1>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input type="password" autoFocus className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl text-center font-bold text-lg outline-none focus:ring-4 focus:ring-blue-500/10" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Admin Password" />
              <button className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl">Access Dashboard</button>
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
                  <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">OAuth & Template Management</p>
               </div>
            </div>
            <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className="px-6 py-2.5 rounded-full border border-slate-200 text-xs font-black text-slate-400 hover:text-red-500 transition-all uppercase tracking-widest">Logout</button>
          </div>

          {testResult && (
            <div className={`mb-12 p-10 rounded-[3rem] border-4 ${testResult.success ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} animate-in slide-in-from-top duration-500`}>
              <div className="flex items-center justify-between mb-6">
                 <span className={`text-lg font-black uppercase tracking-tight ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResult.success ? 'Handshake Success' : 'Handshake Failed'}
                  </span>
                <button onClick={() => setTestResult(null)} className="p-2 hover:bg-white rounded-full"><svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <p className="text-sm font-mono break-all p-4 bg-white rounded-2xl border border-slate-100">{testResult.message}</p>
              {testResult.hint && <p className="mt-4 text-xs font-bold text-slate-500 italic">💡 {testResult.hint}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5">
              <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl sticky top-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-2xl text-blue-400">{editingId ? "Update" : "Setup"} Integration</h3>
                  {editingId && <button onClick={clearForm} className="text-[10px] bg-white/10 px-3 py-1.5 rounded-full font-black">CANCEL</button>}
                </div>

                <form onSubmit={saveForm} className="space-y-6 text-slate-900">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">General</label>
                       <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Form Name (Internal)" className="w-full px-5 py-4 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/30" />
                    </div>
                    <div>
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Template</label>
                       <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Template ID" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <div>
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Role Name</label>
                       <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Signer 1" className="w-full px-5 py-4 rounded-2xl text-sm font-bold outline-none" />
                    </div>
                  </div>

                  <div className="bg-slate-800/50 p-6 rounded-[2rem] space-y-4 border border-slate-700/50">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Zoho API Credentials</label>
                    <input required value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                    <input required type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Client Secret" className="w-full px-5 py-4 rounded-2xl text-sm outline-none" />
                    <input required value={refreshToken} onChange={e => setRefreshToken(e.target.value)} placeholder="Refresh Token" className="w-full px-5 py-4 rounded-2xl text-sm font-mono outline-none" />
                    
                    <div className="pt-2">
                      <button type="button" onClick={() => setHelperVisible(!helperVisible)} className="text-[10px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest flex items-center gap-1 transition-colors">
                        {helperVisible ? '− Hide OAuth Helper' : '+ Show OAuth Helper'}
                      </button>
                      
                      {helperVisible && (
                        <div className="mt-4 p-5 bg-slate-900/50 rounded-2xl border border-blue-500/20 animate-in fade-in duration-300">
                          <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">Paste your <strong>Grant Token (Code)</strong> from Zoho Console below to generate a permanent Refresh Token.</p>
                          <div className="flex gap-2">
                            <input value={helperGrant} onChange={e => setHelperGrant(e.target.value)} placeholder="Paste Code Here..." className="flex-1 px-4 py-3 rounded-xl text-xs bg-slate-800 text-blue-300 border border-slate-700 outline-none" />
                            <button type="button" onClick={handleExchange} disabled={helperLoading} className="bg-blue-600 text-[10px] font-black px-4 rounded-xl hover:bg-blue-500 transition-colors">
                               {helperLoading ? '...' : 'EXCHANGE'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Region (Domain)</label>
                     <select value={apiDomain} onChange={e => setApiDomain(e.target.value)} className="w-full px-5 py-4 rounded-2xl text-sm font-bold outline-none bg-white appearance-none">
                        <option value="https://sign.zoho.com">United States (.com)</option>
                        <option value="https://sign.zoho.eu">Europe (.eu)</option>
                        <option value="https://sign.zoho.in">India (.in)</option>
                        <option value="https://sign.zoho.com.au">Australia (.com.au)</option>
                        <option value="https://sign.zoho.jp">Japan (.jp)</option>
                     </select>
                  </div>

                  <button className="w-full bg-blue-600 text-white font-black py-5 rounded-[1.5rem] hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 text-lg">
                    {editingId ? "Save Changes" : "Create Integration"}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Active Portals</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {forms.map(form => (
                        <tr key={form.id} className={`hover:bg-slate-50/50 transition-colors group ${editingId === form.id ? 'bg-blue-50/50' : ''}`}>
                          <td className="px-8 py-8">
                            <p className="font-black text-slate-800 text-xl tracking-tighter mb-2">{form.name}</p>
                            <div className="flex gap-2 mb-4">
                               <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md font-bold">ROLE: {form.roleName}</span>
                               <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-bold uppercase">{form.apiDomain.split('.').pop()} NODE</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 w-fit">
                               <code className="text-[10px] text-blue-600 font-bold">/f/{form.slug}</code>
                               <button onClick={() => {
                                  const url = `${window.location.origin}${window.location.pathname}#/f/${form.slug}`;
                                  navigator.clipboard.writeText(url);
                                  alert("Portal URL Copied!");
                               }} className="p-1 hover:text-blue-500 text-slate-300"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                            </div>
                          </td>
                          <td className="px-8 py-8">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => runConnectionTest(form)} disabled={testingId === form.id} className="p-3 bg-green-50 text-green-600 rounded-2xl hover:bg-green-600 hover:text-white transition-all shadow-sm" title="Verify Handshake">
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
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Legal Full Name</label>
                    <input required name="signerName" placeholder="As it appears on ID" className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none focus:ring-8 focus:ring-blue-500/10 font-black text-lg" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Email Address</label>
                    <input required name="signerEmail" type="email" placeholder="john@example.com" className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none focus:ring-8 focus:ring-blue-500/10 font-black text-lg" />
                  </div>
                  {error && (
                    <div className="p-6 bg-red-50 text-red-600 text-sm font-bold rounded-3xl border-2 border-red-100 animate-shake">
                       {error}
                    </div>
                  )}
                  <button disabled={loading} className="w-full bg-blue-600 text-white py-7 rounded-[2rem] font-black text-2xl shadow-3xl shadow-blue-600/40 hover:bg-blue-700 transition-all active:scale-[0.98] mt-6 tracking-tight disabled:opacity-50">
                    {loading ? "Initializing Secure Session..." : "Verify & Sign"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white p-20 rounded-[5rem] shadow-2xl text-center border border-slate-100 animate-in zoom-in duration-500">
                <div className="w-32 h-32 bg-green-50 text-green-500 rounded-[3rem] flex items-center justify-center mx-auto mb-12 shadow-inner border-2 border-green-100 animate-bounce">
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">Gateway Open</h2>
                <p className="text-slate-400 font-bold text-xl mb-14">Your document is ready for signature.</p>
                {successData.signingUrl ? (
                  <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black text-2xl shadow-3xl hover:bg-slate-800 transition-all active:scale-95 tracking-tight">Access Portal</button>
                ) : (
                  <div className="bg-blue-50/50 p-10 rounded-[3rem] text-blue-700 font-black text-lg border-2 border-blue-100">
                    Document sent to your inbox.
                  </div>
                )}
                <button onClick={() => setSuccessData(null)} className="mt-14 text-slate-300 font-black uppercase text-sm tracking-[0.5em] hover:text-slate-600 transition-colors">Start New Session</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === ViewMode.NOT_FOUND && (
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-xl">
            <h1 className="text-[10rem] font-black text-slate-100">404</h1>
            <h2 className="text-4xl font-black text-slate-900 mb-6">Portal Not Found</h2>
            <a href="#/admin" className="inline-block px-10 py-4 bg-slate-900 rounded-full text-white font-black text-sm uppercase tracking-widest shadow-xl">Back to Admin</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
