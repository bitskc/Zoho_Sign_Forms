
import React from 'react';

interface HeaderProps {
  isLoggedIn?: boolean;
  onLoginClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ isLoggedIn = false, onLoginClick }) => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-800 tracking-tight">SignFlow <span className="text-blue-600">Pro</span></h1>
        </div>
        <nav className="flex items-center gap-6">
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors hidden md:inline">Documentation</a>
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors hidden md:inline">Support</a>
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <a href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                Home
              </a>
              <a href="#/admin/dashboard" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                Dashboard
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a href="#/admin/login" onClick={onLoginClick} className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                Log In
              </a>
              <a href="#/admin/signup" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
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
