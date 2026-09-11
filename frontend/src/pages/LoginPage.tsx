import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { LoginPageTablet } from './tablet/LoginPageTablet';
import { LoginPageMobile } from './mobile/LoginPageMobile';

const LoginPageDesktop: React.FC = () => {
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
    if (!from || from === '/login' || from.startsWith('/dashboard/')) {
      return '/';
    }
    return from;
  };

  // If already authenticated, redirect
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

  // Quick-fill demo account helper
  const handleQuickFill = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col justify-between selection:bg-lime selection:text-ink">
      {/* Subtle top header bar */}
      <header className="px-8 py-6 flex items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-3">
          <span className="w-3.5 h-3.5 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-lg tracking-tight text-ink">
            Question Generation System
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="pill pill-muted font-mono text-[11px]">v2.4.0 • Institutional</span>
        </div>
      </header>

      {/* Main asymmetric editorial hero & login container */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 lg:py-16">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Big Bold Typography & Feature Cards (Refs: 08 & 13) */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
                <span className="w-2 h-2 rounded-full bg-lime" />
                Adaptive Educational Intelligence
              </div>

              <h1 className="font-heading font-bold text-4xl sm:text-5xl lg:text-6xl text-ink leading-[1.05] tracking-tight">
                Curate with <span className="underline decoration-lime decoration-4 underline-offset-4">precision</span>. Assess with clarity.
              </h1>

              <p className="font-body text-ink/75 text-base sm:text-lg max-w-xl leading-relaxed pt-2">
                Automated Bloom’s taxonomy balancing, dynamic syllabus coverage, and multi-school examination workflows.
              </p>
            </div>

            {/* Asymmetric Highlights (Ref: 13 Eduflex Hero pills/counters) */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <div className="bg-surface border border-border rounded-card px-5 py-3 shadow-card">
                <div className="font-heading font-bold text-2xl text-forest">100%</div>
                <div className="text-xs text-ink/70 font-medium">Syllabus Coverage</div>
              </div>

              <div className="bg-surface border border-border rounded-card px-5 py-3 shadow-card">
                <div className="font-heading font-bold text-2xl text-ember">4 Modes</div>
                <div className="text-xs text-ink/70 font-medium">Difficulty Balancing</div>
              </div>

              <div className="bg-forest text-white rounded-card px-5 py-3 shadow-card">
                <div className="font-heading font-bold text-2xl text-lime">Instant</div>
                <div className="text-xs text-white/80 font-medium">Online & Print Delivery</div>
              </div>
            </div>

            {/* Quick-fill demo account pills */}
            <div className="pt-4 border-t border-border/80">
              <span className="block text-xs font-mono uppercase tracking-wider text-ink/60 mb-2.5">
                Quick Demo Access (Select Role):
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('superadmin', 'password123')}
                  className="pill pill-forest hover:opacity-90 transition-opacity cursor-pointer text-xs"
                >
                  ⚡ Super Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('schooladmin1', 'password123')}
                  className="pill pill-ember hover:opacity-90 transition-opacity cursor-pointer text-xs"
                >
                  ⚡ School Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('teacher1', 'password123')}
                  className="pill pill-grape hover:opacity-90 transition-opacity cursor-pointer text-xs"
                >
                  ⚡ Teacher
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('student1', 'password123')}
                  className="pill pill-lime hover:opacity-90 transition-opacity cursor-pointer text-xs"
                >
                  ⚡ Student
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: High-craft Login Card */}
          <div className="lg:col-span-5">
            <div className="bg-surface border border-border rounded-lg p-8 sm:p-10 shadow-card relative">
              <div className="mb-6">
                <h2 className="font-heading font-bold text-2xl text-ink tracking-tight">
                  Sign in
                </h2>
                <p className="text-sm text-ink/65 mt-1">
                  Access your institutional dashboard
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3.5 mb-6 text-xs font-medium flex items-start gap-2">
                  <span className="font-bold">!</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="username"
                    className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider mb-1.5"
                  >
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Enter username..."
                    autoFocus
                    required
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 transition-colors focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="password"
                      className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                    >
                      Password
                    </label>
                    <a
                      href="/reset-password"
                      className="text-[11px] font-heading font-medium text-forest hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Enter password..."
                    required
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 transition-colors focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  id="login-submit-btn"
                  disabled={isSubmitting}
                  className="w-full mt-2 rounded-pill bg-forest text-white py-3 px-4 text-sm font-heading font-semibold hover:bg-forest/90 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Authenticating...' : 'Sign In to Workspace →'}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-border/80 text-center">
                <span className="font-mono text-[11px] text-ink/50">
                  Role-based capability access enforced
                </span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer bar */}
      <footer className="px-8 py-5 border-t border-border/60 text-xs text-ink/60 flex flex-col sm:flex-row justify-between items-center gap-2">
        <span>© {new Date().getFullYear()} Question Generation System. All rights reserved.</span>
        <span className="font-mono text-[11px]">System Status: Operational</span>
      </footer>
    </div>
  );
};

export const LoginPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <LoginPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <LoginPageTablet key="tablet" />;
  }
  return <LoginPageDesktop key="desktop" />;
};
