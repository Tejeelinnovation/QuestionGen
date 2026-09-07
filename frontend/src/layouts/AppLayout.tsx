import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DesktopLayout } from './desktop/DesktopLayout';

export const AppLayout: React.FC = () => {
  const { user, role_label, logout } = useAuth();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // On desktop breakpoint (>1024px), use the persistent desktop layout
  if (breakpoint === 'desktop') {
    return (
      <DesktopLayout>
        <Outlet />
      </DesktopLayout>
    );
  }

  // Fallback shell for tablet/mobile (to be redesigned in future prompts)
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-border bg-surface px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link to="/" className="font-heading font-bold text-lg text-ink">
            Question Generation System
          </Link>
        </div>

        <div className="flex items-center space-x-4 text-sm">
          {user && (
            <>
              <span>
                User: <strong>{user.username}</strong>
              </span>
              <span>
                Role: <strong>{role_label || 'User'}</strong>
              </span>
              {user.school_name && (
                <span>
                  School: <strong>{user.school_name}</strong>
                </span>
              )}
              <button
                id="logout-btn"
                onClick={handleLogout}
                className="border border-border px-3 py-1 bg-surface-muted hover:bg-surface rounded-pill text-xs font-semibold cursor-pointer"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
};
