
import './index.css';
import React, { Component, useEffect, type ErrorInfo, type PropsWithChildren } from 'react';
import ReactDOM from 'react-dom/client';
import { getPublicFormSlugFromPath, getRouteContext } from './services/routingService';

const AdminApp = React.lazy(() => import('./App'));
const PublicFormApp = React.lazy(() => import('./PublicFormApp'));

const isPublicFormPath = (path: string): boolean => {
  return getPublicFormSlugFromPath(path) !== null;
};

const AppLoadingFallback: React.FC = () => (
  <div role="status" aria-live="polite" className="flex items-center justify-center min-h-screen bg-slate-50">
    <div className="text-center">
      <span className="sr-only">Loading application...</span>
      <div className="motion-safe:animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4" />
      <p className="text-slate-500 font-semibold text-base">Loading...</p>
    </div>
  </div>
);

const RoutedApp: React.FC = () => {
  const routeContext = getRouteContext();

  useEffect(() => {
    if (routeContext.subdomain !== 'root') {
      return;
    }

    const hostnameParts = window.location.hostname.split('.').slice(-2);
    const baseDomain = hostnameParts.join('.');
    const targetUrl = `${window.location.protocol}//www.${baseDomain}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(targetUrl);
  }, [routeContext.subdomain]);

  if (routeContext.subdomain === 'root') {
    return null;
  }

  const path = window.location.pathname || '/';
  const ActiveApp = isPublicFormPath(path) ? PublicFormApp : AdminApp;

  return (
    <React.Suspense fallback={<AppLoadingFallback />}>
      <ActiveApp />
    </React.Suspense>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  declare state: ErrorBoundaryState;
  declare props: PropsWithChildren;

  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const showErrorDetails = import.meta.env.DEV;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh',
          background: '#0f172a', color: '#f1f5f9', fontFamily: 'Inter, sans-serif',
          padding: '2rem', textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem', maxWidth: '480px' }}>
            An unexpected error occurred. Please refresh the page. If the problem persists,
            contact support.
          </p>
          {showErrorDetails && (
            <pre style={{
              background: '#1e293b', borderRadius: '0.5rem', padding: '1rem',
              fontSize: '0.75rem', color: '#f87171', maxWidth: '600px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '1.5rem',
            }}>
              {this.state.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: '0.375rem', padding: '0.625rem 1.25rem',
              fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <RoutedApp />
    </ErrorBoundary>
  </React.StrictMode>
);
