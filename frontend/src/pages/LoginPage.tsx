import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to determine destination
  const getDestination = () => {
    const from = (location.state as any)?.from?.pathname;
    // If from is another dashboard route or login, always route to '/' to allow capability-based dispatch
    if (!from || from === '/login' || from.startsWith('/dashboard/')) {
      return '/';
    }
    return from;
  };

  // If already authenticated, redirect to index or the requested prior page
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(getDestination(), { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username, password);
      navigate(getDestination(), { replace: true });
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Invalid username or password. Please try again.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md border border-gray-300 bg-white p-6">
        <h1 className="text-xl font-bold mb-4">Question Generation System - Login</h1>

        {errorMessage && (
          <div className="border border-red-400 bg-red-50 text-red-700 p-3 mb-4 text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-3 py-2 text-sm"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-3 py-2 text-sm"
              required
            />
          </div>

          <button
            type="submit"
            id="login-submit-btn"
            disabled={isSubmitting}
            className="w-full border border-gray-400 bg-gray-100 py-2 text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
