
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">SignFlow <span className="text-blue-600">Pro</span></h1>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors">Documentation</a>
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors">Support</a>
          <div className="h-4 w-[1px] bg-slate-200"></div>
          <button className="bg-slate-100 text-slate-700 px-4 py-2 rounded-full text-xs font-semibold hover:bg-slate-200 transition-colors">
            API STATUS: ACTIVE
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;
