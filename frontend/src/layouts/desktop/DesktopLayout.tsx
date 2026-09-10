import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export const DesktopLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, hasCapability } = useAuth();
  const location = useLocation();

  // Determine active navigation links based on user capabilities (Teachers only for Create Paper)
  const canCreatePaper =
    user?.role_label === 'Teacher' && hasCapability('CREATE_PAPER');

  const navItems = [
    { label: 'Dashboard', path: '/' },
    ...(canCreatePaper
      ? [{ label: '+ Create Paper', path: '/papers/new' }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* ── Persistent Desktop Top Navigation ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/95 backdrop-blur-sm print:hidden">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand & Context */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 group">
              <span className="w-3 h-3 rounded-full bg-forest group-hover:scale-125 transition-transform" />
              <span className="font-heading font-bold text-lg tracking-tight text-ink">
                Question Generation <span className="text-forest font-mono text-sm font-normal">/sys</span>
              </span>
            </Link>

            {/* Horizontal Text Navigation */}
            <nav className="hidden lg:flex items-center gap-1 border-l border-border pl-6">
              {navItems.map((item) => {
                const isActive =
                  item.path === '/'
                    ? location.pathname === '/' || location.pathname.startsWith('/dashboard')
                    : location.pathname === item.path;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-1.5 text-xs font-heading font-semibold rounded-pill transition-all ${
                      isActive
                        ? 'bg-ink text-white'
                        : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Single Profile Nav Entry Point (Replaces navbar clutter) */}
          <div className="flex items-center gap-3">
            {user && (
              <Link
                to="/profile"
                id="desktop-profile-btn"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-pill border text-xs font-heading font-semibold transition-all ${
                  location.pathname === '/profile'
                    ? 'bg-ink text-white border-ink shadow-sm'
                    : 'bg-surface border-border text-ink hover:border-forest/50 hover:bg-surface-muted'
                }`}
                title="View Profile & Account Settings"
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
                <span>Profile</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};
