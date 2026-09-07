import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  LayoutDashboard,
  FilePlus,
  BookOpen,
  User as UserIcon,
  ClipboardList,
} from 'lucide-react';

export const MobileLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, hasCapability } = useAuth();
  const location = useLocation();

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

        {/* Single Profile Nav Entry Point */}
        <div className="flex items-center gap-2">
          {user && (
            <Link
              to="/profile"
              id="mobile-header-profile-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-pill border text-xs active:scale-95 transition-all ${
                location.pathname === '/profile'
                  ? 'bg-ink text-white border-ink'
                  : 'bg-surface-muted border-border'
              }`}
              aria-label="Profile Settings"
            >
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-heading font-bold ${
                  location.pathname === '/profile'
                    ? 'bg-lime text-ink'
                    : 'bg-forest text-white'
                }`}
              >
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="font-mono text-[11px] font-medium max-w-[80px] truncate">
                {user.username}
              </span>
            </Link>
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

          {/* Dedicated Profile Tab (Replaces cluttered bottom sheet) */}
          <Link
            to="/profile"
            id="mobile-profile-tab-btn"
            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-card transition-colors min-h-[48px] ${
              location.pathname === '/profile'
                ? 'text-forest font-semibold'
                : 'text-ink/60 hover:text-ink'
            }`}
            aria-label="Profile Settings"
          >
            <UserIcon
              className={`w-5 h-5 mb-1 ${
                location.pathname === '/profile' ? 'stroke-[2.5]' : 'stroke-[1.75]'
              }`}
            />
            <span className="text-[11px] font-heading tracking-tight leading-none">
              Profile
            </span>
          </Link>
        </div>
      </nav>
    </div>
  );
};
