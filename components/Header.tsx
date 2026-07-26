import React from 'react';

interface HeaderProps {
  isLoggedIn?: boolean;
  onLoginClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ isLoggedIn = false, onLoginClick }) => {
  return (
    <header className="bg-slate-950/80 backdrop-blur-md border-b border-white/10 px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">SignFlow <span className="text-emerald-400">Pro</span></h1>
        </div>
        <nav className="flex items-center gap-6">
          <a href="https://github.com/bitskc/SignFlow-for-Zoho" target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub" className="text-slate-400 hover:text-emerald-400 transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.435 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.417-1.282.76-1.577-2.677-.295-5.492-1.311-5.492-5.831 0-1.287.465-2.339 1.235-3.164-.135-.295-.54-1.489.105-3.097 0 0 1.005-.314 3.3 1.207.96-.262 1.98-.392 3-.397 1.02.005 2.04.135 3 .397 2.28-1.521 3.285-1.207 3.285-1.207.645 1.608.24 2.802.12 3.097.765.825 1.23 1.877 1.23 3.164 0 4.53-2.82 5.531-5.505 5.821.435.367.81 1.082.81 2.181 0 1.575-.015 2.846-.015 3.231 0 .31.21.681.825.561C20.565 21.917 24 17.498 24 12.292 24 5.78 18.627.5 12 .5z"/></svg>
          </a>
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <a href="/" className="text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                Home
              </a>
              <a href="#/admin/dashboard" className="bg-emerald-500 text-slate-900 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-400 transition-colors">
                Dashboard
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a href="#/admin/login" onClick={onLoginClick} className="text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                Log In
              </a>
              <a href="#/admin/signup" className="bg-emerald-500 text-slate-900 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-400 transition-colors">
                Sign Up
              </a>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
