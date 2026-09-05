import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export const AppLayout: React.FC = () => {
  const { user, role_label, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-gray-300 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link to="/" className="font-bold text-lg">
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
                className="border border-gray-400 px-3 py-1 bg-gray-100 hover:bg-gray-200 cursor-pointer"
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
