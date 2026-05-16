import React, { useEffect, useRef, useState } from 'react';
import { triggerZohoSignTemplate } from './services/zohoService';
import { getEmbedFormSlugFromPath, getPublicFormSlugFromPath, isValidPublicFormSlug } from './services/routingService';
import { getRelativeLuminance } from './utils/accessibility';
import type { FormDefinition, SignerData } from './types';

const slugToTitle = (slug: string): string => {
  return slug
    .split('-')
    .map(word => {
      const upper = word.toUpperCase();
      if (['FBMC', 'LLC', 'INC', 'USA', 'FAQ', 'PDF', 'API'].includes(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

const getSlugFromPath = () => getPublicFormSlugFromPath(window.location.pathname || '/') || getEmbedFormSlugFromPath(window.location.pathname || '/') || '';

const PublicFormApp: React.FC = () => {
  const isEmbedded = getEmbedFormSlugFromPath(window.location.pathname || '/') !== null;
  const [currentForm, setCurrentForm] = useState<FormDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [successData, setSuccessData] = useState<{ requestId: string; signingUrl?: string } | null>(null);
  const trackedVisitsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (window.location.hostname.startsWith('app.')) {
      const hostnameParts = window.location.hostname.split('.').slice(-2);
      const baseDomain = hostnameParts.join('.');
      const targetUrl = `${window.location.protocol}//www.${baseDomain}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(targetUrl);
      return;
    }

    const slug = getSlugFromPath();
    if (!isValidPublicFormSlug(slug)) {
      setError('This signing page could not be found.');
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    const fetchForm = async () => {
      setIsLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const res = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`);
        if (res.status === 429) {
          setError('Too many requests. Please wait a moment and try again.');
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          setError(res.status === 404 ? 'This signing page could not be found.' : 'Unable to load this signing page right now.');
          setNotFound(true);
          return;
        }

        const data = await res.json();
        setCurrentForm(data);
      } catch {
        setError('Unable to load this signing page right now. Please try again.');
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchForm();
  }, []);

  useEffect(() => {
    const base = 'SignFlow Pro';
    if (currentForm?.name) {
      document.title = `${currentForm.name} | ${base}`;
      return;
    }
    if (notFound) {
      document.title = `404 Not Found | ${base}`;
      return;
    }
    document.title = base;
  }, [currentForm?.name, notFound]);

  const trackAnalytics = async (
    formId: string,
    eventType: 'visit' | 'submit_start' | 'submit_success' | 'submit_error',
    data?: { error?: string }
  ) => {
    try {
      const payload = JSON.stringify({
        formId,
        eventType,
        referrer: document.referrer || undefined,
        userAgent: navigator.userAgent,
        metadata: data?.error ? { error: data.error } : undefined,
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
    } catch {
      // Do not block user flow on analytics failure.
    }
  };

  useEffect(() => {
    if (currentForm?.id && !trackedVisitsRef.current.has(currentForm.id)) {
      trackedVisitsRef.current.add(currentForm.id);
      trackAnalytics(currentForm.id, 'visit');
    }
  }, [currentForm?.id]);

  const handlePublicSubmit = async (signer: SignerData) => {
    if (!currentForm) return;
    setLoading(true);
    setError(null);

    trackAnalytics(currentForm.id!, 'submit_start');

    const res = await triggerZohoSignTemplate(currentForm, signer, false);

    if (res.success) {
      trackAnalytics(currentForm.id!, 'submit_success');
      if (res.signingUrl) {
        window.location.href = res.signingUrl;
        return;
      }
      setSuccessData({ requestId: res.requestId || 'unknown', signingUrl: undefined });
    } else {
      trackAnalytics(currentForm.id!, 'submit_error', { error: res.error });
      setError('We could not prepare this document. Please try again or contact the sender.');
    }

    setLoading(false);
  };

  if (notFound) {
    return (
      <main id="main-content">
        <div className="flex items-center justify-center min-h-screen text-center px-6">
          <div className="max-w-xl">
            <h1 className="text-[clamp(4rem,25vw,10rem)] font-black leading-none text-slate-900">404</h1>
            <h2 className="text-4xl font-black mb-4 text-slate-900">Signing Page Unavailable</h2>
            <p className="mb-6 text-slate-600">{error || 'This signing page could not be found. Please check the link or contact the sender.'}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-block px-8 py-3 bg-slate-900 rounded-full text-white font-bold text-sm uppercase tracking-widest shadow-xl focus-visible:ring-2 focus-visible:ring-white outline-none"
            >
              Try Again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (isLoading || !currentForm) {
    return (
      <main id="main-content">
        <div className="min-h-screen p-6 flex flex-col bg-slate-50">
          <div className="flex-1 flex items-center justify-center">
            <div role="status" aria-live="polite" className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl p-8">
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

  const lc = currentForm?.landingConfig || {};
  const theme = lc.theme || {};
  const contact = lc.contact || {};
  const instantTitle = currentForm?.name || slugToTitle(getSlugFromPath());
  const headline = lc.headline || instantTitle;
  const description = lc.description;
  const buttonText = lc.buttonText || 'Sign Now';
  const showPoweredBy = lc.showPoweredBy !== false;
  const primaryColor = theme.primaryColor || '#3B82F6';
  const bgColor = theme.backgroundColor || '#F8FAFC';
  const cardColor = theme.cardColor || '#FFFFFF';

  const luminance = getRelativeLuminance(cardColor);
  const autoTextColors = luminance < 0.5
    ? { text: '#F1F5F9', muted: '#94A3B8' }
    : { text: '#1E293B', muted: '#64748B' };
  const textColor = theme.textColor || autoTextColors.text;
  const mutedColor = theme.mutedColor || autoTextColors.muted;
  const inputStyles = {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    color: '#0F172A',
    caretColor: '#0F172A',
    '--tw-ring-color': `${primaryColor}50`,
  } as React.CSSProperties;

  return (
      <main id="main-content">
        <div className={`${isEmbedded ? 'min-h-0 p-3' : 'min-h-screen p-6'} flex flex-col`} style={{ backgroundColor: bgColor }}>
        {!isEmbedded && lc.logoUrl && (
          <div className="text-center pt-6 pb-2">
            <img src={lc.logoUrl} alt={lc.logoAlt || 'Company logo'} className="h-12 mx-auto object-contain" />
          </div>
        )}

        <div className={`${isEmbedded ? '' : 'flex-1 flex items-center justify-center'}`}>
          <div className="w-full max-w-md">
            {successData ? (
              <div className="p-10 rounded-lg shadow-xl text-center animate-in zoom-in duration-500 border" style={{ backgroundColor: cardColor, borderColor: '#E2E8F0', color: textColor }}>
                <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: '#ECFDF5', color: '#10B981' }}>
                  <svg aria-hidden="true" focusable="false" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-2xl font-bold mb-2">Document Ready</h2>
                <p className="text-sm mb-6" style={{ color: mutedColor }}>Your agreement is prepared and waiting.</p>
                {successData.signingUrl ? (
                  <button onClick={() => window.location.href = successData.signingUrl!} className="w-full py-3.5 rounded-lg font-bold text-base shadow-lg hover:opacity-90 transition-all active:scale-[0.98]" style={{ backgroundColor: primaryColor, color: '#FFFFFF' }}>Open Signature Interface</button>
                ) : (
                  <div className="p-4 rounded-lg text-sm font-medium" style={{ backgroundColor: '#EFF6FF', color: primaryColor, border: `1px solid ${primaryColor}33` }}>
                    Your agreement was prepared. Check your email for the secure signing link.
                  </div>
                )}
                <button onClick={() => setSuccessData(null)} className="mt-6 font-semibold text-xs uppercase tracking-wider transition-colors hover:opacity-70" style={{ color: mutedColor }}>Go Back</button>
              </div>
            ) : (
              <div className="rounded-lg shadow-xl border" style={{ backgroundColor: cardColor, borderColor: '#E2E8F0' }}>
                <div className={isEmbedded ? 'p-5' : 'p-8'}>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg mb-4" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                      <svg aria-hidden="true" focusable="false" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </div>
                    <h1 className="text-2xl font-bold mb-2" style={{ color: textColor }}>{headline}</h1>
                    {description ? (
                      <p className="text-sm leading-relaxed" style={{ color: mutedColor }}>{description}</p>
                    ) : (
                      <p className="text-sm" style={{ color: mutedColor }}>Digital Signature Gateway</p>
                    )}
                  </div>

                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const target = e.target as HTMLFormElement & { signerName: { value: string }; signerEmail: { value: string } };
                    handlePublicSubmit({ name: target.signerName.value, email: target.signerEmail.value });
                  }} className="space-y-5">
                    <div className="space-y-2">
                      <label htmlFor="signerName" className="text-xs font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>
                        Full Name <span aria-hidden="true" style={{ color: '#B91C1C' }}>*</span>
                      </label>
                      <input required id="signerName" name="signerName" placeholder="John Doe" autoFocus={!isEmbedded} aria-required="true" className="w-full px-4 py-3 rounded-lg outline-none focus:ring-2 font-medium text-base border placeholder:text-slate-400" style={inputStyles} />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="signerEmail" className="text-xs font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>
                        Email Address <span aria-hidden="true" style={{ color: '#B91C1C' }}>*</span>
                      </label>
                      <input required id="signerEmail" name="signerEmail" type="email" placeholder="john@example.com" aria-required="true" className="w-full px-4 py-3 rounded-lg outline-none focus:ring-2 font-medium text-base border placeholder:text-slate-400" style={inputStyles} />
                    </div>
                    {error && (
                      <div role="alert" className="p-3 text-xs font-medium rounded-lg" style={{ backgroundColor: 'rgba(185, 28, 28, 0.1)', color: '#B91C1C', border: '1px solid rgba(185, 28, 28, 0.3)' }}>
                        {error}
                      </div>
                    )}
                    <p className="text-[11px] leading-relaxed" style={{ color: mutedColor }}>
                      By submitting, you agree that your name and email will be shared with the document sender and Zoho Sign to complete your signature.
                    </p>
                    <button disabled={loading} className="w-full py-3.5 rounded-lg font-bold text-base shadow-lg transition-all active:scale-[0.98] disabled:opacity-50" style={{ backgroundColor: primaryColor, color: '#FFFFFF', boxShadow: `0 4px 14px ${primaryColor}30` }}>
                      {loading ? 'Preparing Document...' : buttonText}
                    </button>
                  </form>
                </div>

                {(contact.companyName || contact.email || contact.phone) && (
                  <div className="px-8 py-4 border-t text-center text-xs" style={{ borderColor: '#E2E8F0', color: mutedColor }}>
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

        <div className={`${isEmbedded ? 'py-2' : 'py-4'} text-center text-xs`} style={{ color: mutedColor }}>
          {lc.footerText && <p className="mb-1">{lc.footerText}</p>}
          {showPoweredBy && (
            <p className="opacity-60">Powered by <a href="https://signflow.ink" className="hover:underline">SignFlow</a></p>
          )}
        </div>
      </div>
    </main>
  );
};

export default PublicFormApp;
