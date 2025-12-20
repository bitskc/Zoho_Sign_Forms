
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
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

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
      templateId,
      roleName: roleName || "Signer 1",
      accessToken,
      apiDomain: apiDomain || 'https://sign.zoho.com',
      slug: slug || formName.toLowerCase().replace(/\s+/g, '-'),
      createdAt: editingId ? (forms.find(f => f.id === editingId)?.createdAt || Date.now()) : Date.now()
    };
    let updated = editingId ? forms.map(f => f.id === editingId ? newForm : f) : [...forms, newForm];
    setForms(updated);
    storage.saveForms(updated);
    clearForm();
  };

  const deleteForm = (id: string) => {
    if (confirm("Are you sure?")) {
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
      message: res.success ? `Successfully generated signing request: ${res.requestId}` : res.error || "Unknown Error"
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
          <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4 text-white font-black text-xl">S</div>
              <h1 className="text-2xl font-bold text-slate-800">Admin Access</h1>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input type="password" autoFocus className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" />
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all">Unlock Dashboard</button>
            </form>
          </div>
        </div>
      )}

      {view === ViewMode.ADMIN_DASHBOARD && (
        <div className="max-w-6xl mx-auto p-6 lg:p-12">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-black text-slate-900">SignFlow Dashboard</h1>
            <button onClick={() => setView(ViewMode.ADMIN_LOGIN)} className="text-sm font-bold text-slate-400 hover:text-red-500">Logout</button>
          </div>

          {testResult && (
            <div className={`mb-8 p-6 rounded-3xl border ${testResult.success ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} animate-in slide-in-from-top duration-300`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-black uppercase tracking-widest ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success ? 'Connection Success' : 'Connection Failure'}
                </span>
                <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className={`text-sm font-mono break-words ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>{testResult.message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-2xl sticky top-6">
                <h3 className="font-bold text-xl text-blue-400 mb-6">{editingId ? "Edit Form" : "Create New Form"}</h3>
                <form onSubmit={saveForm} className="space-y-4 text-slate-900">
                  <input required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Form Name" className="w-full px-4 py-3 rounded-xl text-sm" />
                  <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="URL Slug (Optional)" className="w-full px-4 py-3 rounded-xl text-sm" />
                  <input required value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="Zoho Template ID" className="w-full px-4 py-3 rounded-xl text-sm" />
                  <input required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role Name" className="w-full px-4 py-3 rounded-xl text-sm" />
                  <input required type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="OAuth Access Token" className="w-full px-4 py-3 rounded-xl text-sm" />
                  <input required value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="API Domain (e.g. sign.zoho.com)" className="w-full px-4 py-3 rounded-xl text-sm" />
                  <button className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-500 transition-all">{editingId ? "Save Changes" : "Deploy Form"}</button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Form Details</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {forms.map(form => (
                      <tr key={form.id} className={`hover:bg-slate-50 transition-colors ${editingId === form.id ? 'bg-blue-50' : ''}`}>
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-800">{form.name}</p>
                          <div className="flex gap-2 mt-1">
                             <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">ID: {form.templateId}</span>
                             <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase">ROLE: {form.roleName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              disabled={testingId === form.id}
                              onClick={() => runConnectionTest(form)}
                              className={`p-2 rounded-xl transition-all ${testingId === form.id ? 'bg-slate-200 animate-pulse' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                              title="Test Connection"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                            <button onClick={() => startEdit(form)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onClick={() => deleteForm(form.id)} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
      )}

      {view === ViewMode.PUBLIC_FORM && currentForm && (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-lg">
            {!successData ? (
              <div className="bg-white p-10 rounded-3xl shadow-2xl border border-slate-200">
                <h1 className="text-3xl font-black text-slate-900 mb-2 text-center">{currentForm.name}</h1>
                <p className="text-slate-500 mb-8 text-center">Sign the document instantly in your browser.</p>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                }} className="space-y-5">
                  <input required name="signerName" placeholder="Full Name" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                  <input required name="signerEmail" type="email" placeholder="Email Address" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                  {error && <div className="p-4 bg-red-50 text-red-600 text-xs font-mono rounded-xl border border-red-100">{error}</div>}
                  <button disabled={loading} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 disabled:opacity-50">
                    {loading ? "Processing..." : "Start Signing"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-3xl shadow-2xl text-center">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6"><svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Ready to Sign!</h2>
                {successData.signingUrl ? (
                  <button onClick={() => openZohoSign(successData.signingUrl!)} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg mt-6">Open Document</button>
                ) : <p className="text-slate-500 mt-4">An email has been sent to your inbox.</p>}
                <button onClick={() => setSuccessData(null)} className="mt-8 text-slate-400 font-bold uppercase text-xs tracking-widest">Return to Form</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === ViewMode.NOT_FOUND && <div className="flex items-center justify-center min-h-screen">Form not found.</div>}
    </div>
  );
};

export default App;
