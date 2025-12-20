
import React, { useState, useEffect } from 'react';
import { ViewMode, FormDefinition, ZohoConfig, SignerData } from './types';
import { storage } from './services/storageService';
import { triggerZohoSignTemplate } from './services/zohoService';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.PUBLIC_FORM);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [config, setConfig] = useState<ZohoConfig>(storage.getConfig());
  const [currentForm, setCurrentForm] = useState<FormDefinition | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{requestId: string, signingUrl?: string} | null>(null);

  // Sync with URL hash for simple routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/f/')) {
        const slug = hash.replace('#/f/', '');
        const allForms = storage.getForms();
        const found = allForms.find(f => f.slug === slug);
        if (found) {
          setCurrentForm(found);
          setView(ViewMode.PUBLIC_FORM);
        } else {
          setView(ViewMode.NOT_FOUND);
        }
      } else if (hash === '#/admin') {
        setView(ViewMode.ADMIN_LOGIN);
      } else {
        // Default to admin login if no form specified for this demo
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

  const addForm = (name: string, templateId: string, slug: string) => {
    const newForm: FormDefinition = {
      id: crypto.randomUUID(),
      name,
      templateId,
      slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
      createdAt: Date.now()
    };
    const updated = [...forms, newForm];
    setForms(updated);
    storage.saveForms(updated);
  };

  const deleteForm = (id: string) => {
    const updated = forms.filter(f => f.id !== id);
    setForms(updated);
    storage.saveForms(updated);
  };

  const handlePublicSubmit = async (signer: SignerData) => {
    if (!currentForm) return;
    setLoading(true);
    setError(null);
    const res = await triggerZohoSignTemplate(config, currentForm.templateId, signer);
    if (res.success) {
      setSuccessData({ requestId: res.requestId!, signingUrl: res.signingUrl });
    } else {
      setError(res.error || "Submission failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {view === ViewMode.ADMIN_LOGIN && (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4 text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Admin Access</h1>
              <p className="text-slate-500 text-sm">SignFlow Pro Management</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                <input 
                  type="password" 
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                />
              </div>
              {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
              <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all">
                Unlock Dashboard
              </button>
            </form>
          </div>
        </div>
      )}

      {view === ViewMode.ADMIN_DASHBOARD && (
        <div className="max-w-6xl mx-auto p-6 lg:p-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-black text-slate-900">SignFlow Dashboard</h1>
              <p className="text-slate-500">Manage your custom signature forms</p>
            </div>
            <button 
              onClick={() => setView(ViewMode.ADMIN_LOGIN)}
              className="text-sm font-bold text-slate-400 hover:text-red-500"
            >
              Logout
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4">Global Config</h3>
                <div className="space-y-3">
                  <input 
                    type="password" 
                    placeholder="Zoho Access Token"
                    className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                    value={config.accessToken}
                    onChange={e => {
                      const newCfg = {...config, accessToken: e.target.value};
                      setConfig(newCfg);
                      storage.saveConfig(newCfg);
                    }}
                  />
                  <input 
                    type="text" 
                    placeholder="API Domain"
                    className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                    value={config.apiDomain}
                    onChange={e => {
                      const newCfg = {...config, apiDomain: e.target.value};
                      setConfig(newCfg);
                      storage.saveConfig(newCfg);
                    }}
                  />
                  <p className="text-[10px] text-slate-400 leading-tight">Changes are saved automatically to your local browser storage.</p>
                </div>
              </div>

              <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-100">
                <h3 className="font-bold mb-2">Create New Form</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  addForm(target.fname.value, target.tid.value, target.fslug.value);
                  target.reset();
                }} className="space-y-3 mt-4 text-slate-900">
                  <input required name="fname" placeholder="Form Name" className="w-full px-4 py-2 rounded-lg text-sm outline-none" />
                  <input required name="tid" placeholder="Zoho Template ID" className="w-full px-4 py-2 rounded-lg text-sm outline-none" />
                  <input name="fslug" placeholder="URL Slug (Optional)" className="w-full px-4 py-2 rounded-lg text-sm outline-none" />
                  <button className="w-full bg-white text-blue-600 font-bold py-2 rounded-lg hover:bg-blue-50 transition-colors">
                    Generate Form
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Form Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Public Link</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {forms.map(form => (
                      <tr key={form.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-700">{form.name}</p>
                          <p className="text-[10px] text-slate-400">ID: {form.templateId}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <code className="text-[10px] bg-slate-100 px-2 py-1 rounded truncate max-w-[150px]">#/f/{form.slug}</code>
                            <button 
                              onClick={() => {
                                const url = `${window.location.origin}${window.location.pathname}#/f/${form.slug}`;
                                navigator.clipboard.writeText(url);
                                alert("Link copied to clipboard!");
                              }}
                              className="p-1 hover:text-blue-600 text-slate-400"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => deleteForm(form.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {forms.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                          No forms created yet. Use the panel on the left to start.
                        </td>
                      </tr>
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
          <div className="w-full max-w-lg">
            {!successData ? (
              <div className="bg-white p-10 rounded-3xl shadow-2xl border border-slate-200">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-black text-slate-900 mb-2">{currentForm.name}</h1>
                  <p className="text-slate-500">Please provide your details to initiate the document signature.</p>
                </div>
                
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                }} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2 ml-1">Full Name</label>
                    <input 
                      required
                      name="signerName"
                      type="text" 
                      placeholder="Jane Doe"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2 ml-1">Email Address</label>
                    <input 
                      required
                      name="signerEmail"
                      type="email" 
                      placeholder="jane@company.com"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>

                  {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

                  <button 
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center shadow-xl shadow-blue-200"
                  >
                    {loading ? (
                      <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : "Sign Document"}
                  </button>
                </form>
                <p className="mt-8 text-center text-slate-400 text-xs">Securely processed via Zoho Sign Integration</p>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-3xl shadow-2xl border border-slate-200 text-center animate-in zoom-in duration-300">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Request Successful!</h2>
                <p className="text-slate-500 mb-8">Your document is ready to be signed.</p>
                
                {successData.signingUrl ? (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-slate-600">You can sign the document immediately using the button below:</p>
                    <a 
                      href={successData.signingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 transition-all shadow-xl shadow-green-100"
                    >
                      Sign Now
                    </a>
                    <p className="text-xs text-slate-400">Alternatively, check your email for the signature invitation link.</p>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <p className="text-slate-600 text-sm">An email has been sent to the address provided with instructions to complete the signature.</p>
                    <p className="mt-2 text-[10px] font-mono text-slate-400 uppercase tracking-widest">ID: {successData.requestId}</p>
                  </div>
                )}
                
                <button 
                  onClick={() => setSuccessData(null)}
                  className="mt-8 text-blue-600 font-bold hover:underline"
                >
                  Go Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === ViewMode.NOT_FOUND && (
        <div className="flex items-center justify-center min-h-screen text-center p-6">
          <div>
            <h1 className="text-6xl font-black text-slate-200 mb-4">404</h1>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Form Not Found</h2>
            <p className="text-slate-500 mb-6">The link you followed may be broken or expired.</p>
            <a href="#/admin" className="text-blue-600 font-bold hover:underline">Return to Admin</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
