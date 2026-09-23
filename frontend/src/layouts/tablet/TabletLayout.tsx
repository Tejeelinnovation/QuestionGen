import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export const TabletLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, hasCapability } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getRolePillClass = () => {
    switch (user?.role_label) {
      case 'Super Admin':
        return 'pill-forest';
      case 'School Admin':
        return 'pill-ember';
      case 'Teacher':
        return 'pill-grape';
      case 'Student':
        return 'pill-lime';
      default:
        return 'pill-muted';
    }
  };

  const canCreatePaper =
    user?.role_label === 'Teacher' && hasCapability('CREATE_PAPER');

  const navItems = [
    { label: 'Dashboard', path: '/' },
    ...(canCreatePaper
      ? [{ label: '+ Create Paper', path: '/papers/new' }]
      : []),
  ];

  const isAttemptMode = /^\/deliveries\/\d+\/attempt(\/|$)/.test(location.pathname);

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* ── Tablet Header Bar (Touch-Optimized, Sticky) ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/95 backdrop-blur-sm print:hidden">
        <div className="px-6 h-16 flex items-center justify-between">
          {/* Hamburger Trigger & Brand */}
          <div className="flex items-center gap-4">
            {!isAttemptMode ? (
              <>
                <button
                  type="button"
                  id="tablet-sidebar-toggle"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open Navigation Menu"
                  className="w-11 h-11 flex items-center justify-center rounded-card border border-border bg-surface-muted text-ink hover:bg-surface active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-xl leading-none">☰</span>
                </button>

                <Link to="/" className="flex items-center gap-2.5 group">
                  <span className="w-3.5 h-3.5 rounded-full bg-forest group-hover:scale-125 transition-transform" />
                  <span className="font-heading font-bold text-lg tracking-tight text-ink">
                    Question Generation <span className="text-forest font-mono text-sm font-normal">/tablet</span>
                  </span>
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2.5 select-none">
                <span className="w-3.5 h-3.5 rounded-full bg-forest animate-pulse" />
                <span className="font-heading font-bold text-lg tracking-tight text-ink">
                  Question Generation <span className="text-forest font-mono text-xs font-semibold bg-forest/10 px-2 py-0.5 rounded border border-forest/20">EXAM MODE</span>
                </span>
              </div>
            )}
          </div>

          {/* Single Profile Nav Entry Point (Locked to static indicator during exam) */}
          <div className="flex items-center gap-3">
            {user && (
              isAttemptMode ? (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-pill border border-border bg-surface-muted text-ink select-none cursor-default"
                  title={`Candidate: ${user.username}`}
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-heading font-bold shrink-0 bg-forest text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-heading font-semibold text-xs max-w-[100px] truncate">
                    {user.username}
                  </span>
                </div>
              ) : (
                <Link
                  to="/profile"
                  id="tablet-profile-btn"
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-pill border transition-all ${
                    location.pathname === '/profile'
                      ? 'bg-ink text-white border-ink'
                      : 'bg-surface border-border text-ink hover:bg-surface-muted'
                  }`}
                  aria-label="Profile Settings"
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-heading font-bold shrink-0 ${
                      location.pathname === '/profile'
                        ? 'bg-lime text-ink'
                        : 'bg-forest text-white'
                    }`}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-heading font-semibold text-xs max-w-[100px] truncate">
                    {user.username}
                  </span>
                </Link>
              )
            )}
          </div>
        </div>
      </header>

      {/* ── Slide-Out Collapsible Sidebar Drawer (Disabled during active attempt) ── */}
      {!isAttemptMode && sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {!isAttemptMode && (
        <aside
          className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-surface border-r border-border shadow-float transform transition-transform duration-300 ease-out flex flex-col justify-between print:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
        <div className="p-6 space-y-6">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-forest" />
              <span className="font-heading font-bold text-base text-ink">
                Navigation
              </span>
            </div>
            <button
              type="button"
              id="tablet-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="w-10 h-10 rounded-card border border-border bg-surface-muted flex items-center justify-center text-sm font-bold text-ink hover:bg-surface active:scale-95 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* User Details in Drawer */}
          {user && (
            <div className="p-4 rounded-card bg-bg border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className={`pill ${getRolePillClass()}`}>
                  {user.role_label || 'User'}
                </span>
                <span className="font-mono text-xs text-ink/50">#{user.id}</span>
              </div>
              <div className="font-heading font-bold text-sm text-ink truncate">
                {user.username}
              </div>
              {user.school_name && (
                <div className="text-xs text-ink/60 font-medium truncate">
                  {user.school_name}
                </div>
              )}
            </div>
          )}

          {/* Nav Links List (Touch Target min 48px) */}
          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/' || location.pathname.startsWith('/dashboard')
                  : location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center px-4 py-3 rounded-card text-sm font-heading font-semibold transition-all min-h-[48px] ${
                    isActive
                      ? 'bg-forest text-white shadow-sm'
                      : 'text-ink/80 hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Profile Entry in Drawer */}
            <Link
              to="/profile"
              onClick={() => setSidebarOpen(false)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-card text-sm font-heading font-semibold transition-all min-h-[48px] ${
                location.pathname === '/profile'
                  ? 'bg-forest text-white shadow-sm'
                  : 'text-ink/80 hover:bg-surface-muted hover:text-ink border border-border/60'
              }`}
            >
              <span>Profile & Capabilities</span>
              <span className="text-xs opacity-70">→</span>
            </Link>
          </nav>
        </div>

        {/* Drawer Footer */}
        <div className="p-6 border-t border-border space-y-2">
          <div className="font-mono text-[11px] text-ink/40 uppercase">
            Question Generation System • Tablet
          </div>
          <Link
            to="/profile"
            onClick={() => setSidebarOpen(false)}
            className="w-full py-2.5 px-3 rounded-pill border border-border bg-surface text-ink/80 text-xs font-heading font-medium hover:text-ink flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Account & Sign Out</span>
          </Link>
        </div>
      </aside>
      )}

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};
