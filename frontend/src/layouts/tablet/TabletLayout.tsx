import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export const TabletLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, role_label, logout, hasCapability } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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

  const navItems = [
    { label: 'Dashboard', path: '/' },
    ...(hasCapability('CREATE_PAPER')
      ? [{ label: '+ Create Paper', path: '/papers/new' }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* ── Tablet Header Bar (Touch-Optimized, Sticky) ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="px-6 h-16 flex items-center justify-between">
          {/* Hamburger Trigger & Brand */}
          <div className="flex items-center gap-4">
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
          </div>

          {/* User Badge & Fast Logout */}
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex items-center gap-2 bg-surface-muted border border-border px-3 py-1.5 rounded-pill text-xs">
                <span className={`pill ${getRolePillClass()}`}>
                  {role_label || 'User'}
                </span>
                <span className="font-mono font-semibold text-ink">{user.username}</span>
              </div>
            )}

            <button
              id="logout-btn"
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-semibold font-heading rounded-pill border border-border bg-surface text-ink hover:bg-ink hover:text-white transition-colors cursor-pointer min-h-[40px] flex items-center"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Slide-Out Collapsible Sidebar Drawer (Touch-First) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-surface border-r border-border shadow-float transform transition-transform duration-300 ease-out flex flex-col justify-between ${
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
                  {role_label || 'User'}
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
          </nav>
        </div>

        {/* Drawer Footer */}
        <div className="p-6 border-t border-border space-y-3">
          <div className="font-mono text-[11px] text-ink/40 uppercase">
            Question Generation System • Tablet
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-ink hover:text-white transition-colors cursor-pointer min-h-[44px]"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};
