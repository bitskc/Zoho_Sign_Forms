
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
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
          <pre style={{
            background: '#1e293b', borderRadius: '0.5rem', padding: '1rem',
            fontSize: '0.75rem', color: '#f87171', maxWidth: '600px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '1.5rem',
          }}>
            {this.state.message}
          </pre>
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
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
