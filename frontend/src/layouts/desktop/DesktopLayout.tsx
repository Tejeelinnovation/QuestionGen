import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export const DesktopLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, role_label, logout, hasCapability } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  // Determine active navigation links based on user capabilities
  const navItems = [
    { label: 'Dashboard', path: '/' },
    ...(hasCapability('CREATE_PAPER')
      ? [{ label: '+ Create Paper', path: '/papers/new' }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* ── Persistent Desktop Top Navigation ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/95 backdrop-blur-sm">
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

          {/* User Identity & Logout */}
          <div className="flex items-center gap-4 text-xs">
            {user && (
              <div className="flex items-center gap-3 bg-surface-muted border border-border px-3 py-1.5 rounded-pill">
                <span className={`pill ${getRolePillClass()}`}>
                  {role_label || 'User'}
                </span>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-ink/60">user:</span>
                  <span className="font-mono font-semibold text-ink">{user.username}</span>
                </div>

                {user.school_name && (
                  <div className="hidden xl:flex items-center gap-1 text-ink/60 border-l border-border pl-2.5">
                    <span>at</span>
                    <span className="font-medium text-ink truncate max-w-[140px]">
                      {user.school_name}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              id="logout-btn"
              onClick={handleLogout}
              className="px-3.5 py-1.5 text-xs font-semibold font-heading rounded-pill border border-border bg-surface text-ink hover:bg-ink hover:text-white transition-colors cursor-pointer"
            >
              Sign out
            </button>
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
