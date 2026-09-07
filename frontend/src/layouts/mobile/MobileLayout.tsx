import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  LayoutDashboard,
  FilePlus,
  BookOpen,
  User as UserIcon,
  LogOut,
  X,
  ClipboardList,
} from 'lucide-react';

export const MobileLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, role_label, logout, hasCapability } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const handleLogout = async () => {
    setIsAccountOpen(false);
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

  // Mobile Bottom Tab Items tailored by capability
  const isTeacher = hasCapability('CREATE_PAPER');
  const isStudent = hasCapability('ATTEMPT_TEST');

  const tabs = [
    {
      id: 'home',
      label: 'Home',
      icon: LayoutDashboard,
      path: '/',
      isActive: location.pathname === '/' || location.pathname.startsWith('/dashboard'),
    },
    ...(isTeacher
      ? [
          {
            id: 'new-paper',
            label: 'New Paper',
            icon: FilePlus,
            path: '/papers/new',
            isActive: location.pathname === '/papers/new',
          },
        ]
      : []),
    ...(isStudent
      ? [
          {
            id: 'assessments',
            label: 'Assessments',
            icon: BookOpen,
            path: '/dashboard/student',
            isActive: location.pathname.startsWith('/dashboard/student') || location.pathname.includes('/attempt'),
          },
        ]
      : []),
    ...(!isTeacher && !isStudent
      ? [
          {
            id: 'directory',
            label: 'Overview',
            icon: ClipboardList,
            path: '/',
            isActive: location.pathname === '/',
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink relative pb-20">
      {/* ── Mobile Top Header (Clean, Compact, Touch-Optimized) ── */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-surface/95 backdrop-blur-md px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-forest" />
          <span className="font-heading font-bold text-base tracking-tight text-ink">
            Question Gen <span className="text-forest font-mono text-[10px] font-normal">/mobile</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={() => setIsAccountOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-surface-muted border border-border text-xs active:scale-95 transition-transform"
              aria-label="Open Account Menu"
            >
              <span className={`pill text-[10px] py-0.5 px-2 ${getRolePillClass()}`}>
                {role_label || 'User'}
              </span>
              <span className="font-mono text-[11px] font-medium text-ink/70 max-w-[80px] truncate">
                {user.username}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Mobile Content Area ── */}
      <main className="flex-1 w-full px-4 py-5 max-w-lg mx-auto">
        {children}
      </main>

      {/* ── Persistent Mobile Bottom Tab Bar ── */}
      <nav
        id="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border px-2 py-1 shadow-float"
        aria-label="Mobile Navigation"
      >
        <div className="flex items-center justify-around max-w-md mx-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-card transition-colors min-h-[48px] ${
                  tab.isActive
                    ? 'text-forest font-semibold'
                    : 'text-ink/60 hover:text-ink'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1 ${tab.isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                <span className="text-[11px] font-heading tracking-tight leading-none">
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {/* Account Tab */}
          <button
            type="button"
            id="mobile-account-tab-btn"
            onClick={() => setIsAccountOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-card transition-colors min-h-[48px] cursor-pointer ${
              isAccountOpen ? 'text-forest font-semibold' : 'text-ink/60 hover:text-ink'
            }`}
            aria-label="Account Settings"
          >
            <UserIcon className="w-5 h-5 mb-1 stroke-[1.75]" />
            <span className="text-[11px] font-heading tracking-tight leading-none">
              Account
            </span>
          </button>
        </div>
      </nav>

      {/* ── Account Bottom Sheet Drawer ── */}
      {isAccountOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setIsAccountOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet Body */}
          <div className="relative z-10 w-full bg-surface border-t border-border rounded-t-lg p-5 shadow-float space-y-4 max-w-lg mx-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-forest" />
                <span className="font-heading font-bold text-base text-ink">
                  Account Details
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountOpen(false)}
                className="w-8 h-8 rounded-card border border-border bg-surface-muted flex items-center justify-center text-ink/70 hover:text-ink active:scale-95"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {user && (
              <div className="p-3.5 rounded-card bg-bg border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`pill ${getRolePillClass()}`}>
                    {role_label || 'User'}
                  </span>
                  <span className="font-mono text-xs text-ink/50">ID #{user.id}</span>
                </div>
                <div className="font-heading font-bold text-base text-ink">
                  {user.username}
                </div>
                {user.email && (
                  <div className="text-xs text-ink/70 font-mono">
                    {user.email}
                  </div>
                )}
                {user.school_name && (
                  <div className="text-xs text-forest font-semibold pt-1 border-t border-border/60">
                    School: {user.school_name}
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                id="mobile-logout-btn"
                onClick={handleLogout}
                className="w-full py-3 px-4 rounded-pill border border-border bg-surface-muted text-ink font-heading font-semibold text-sm hover:bg-ink hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign out of System
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
