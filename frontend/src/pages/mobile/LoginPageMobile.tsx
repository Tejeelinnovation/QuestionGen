import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ArrowRight, Lock, User as UserIcon, Sparkles, Eye, EyeOff } from 'lucide-react';

export const LoginPageMobile: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getDestination = () => {
    const from = (location.state as any)?.from?.pathname;
    if (!from || from === '/login' || from.startsWith('/dashboard/')) {
      return '/';
    }
    return from;
  };

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

  const handleQuickFill = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col justify-between p-5 font-body selection:bg-lime selection:text-ink">
      {/* ── Mobile Top Brand Header ── */}
      <header className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-base tracking-tight text-ink">
            Question Gen <span className="text-forest font-mono text-xs">/mobile</span>
          </span>
        </div>
        <span className="pill pill-forest text-[11px] font-mono">Mobile Edition</span>
      </header>

      {/* ── Editorial Headline & Form ── */}
      <main className="my-auto py-6 space-y-6">
        {/* Editorial Heading */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest">
            <Sparkles className="w-3 h-3 text-forest" />
            Curriculum Intelligence
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink leading-tight tracking-tight">
            Curate with precision. Assess with clarity.
          </h1>
          <p className="text-xs sm:text-sm text-ink/75 leading-relaxed">
            Institutional examination creation, student delivery, and instant auto-grading in the palm of your hand.
          </p>
        </div>

        {/* Login Card */}
        <div className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4">
          <div className="border-b border-border pb-3">
            <h2 className="font-heading font-bold text-lg text-ink">
              Sign In
            </h2>
            <p className="text-xs text-ink/60">
              Enter your credentials or use a quick demo role below.
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-card border border-ember/40 bg-ember/10 text-ember p-3 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-username"
                className="block text-xs font-heading font-semibold text-ink"
              >
                Username
              </label>
              <div className="relative">
                <input
                  id="mobile-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. teacher1"
                  required
                  autoCapitalize="none"
                  className="w-full pl-9 pr-3 py-3 rounded-card bg-surface border border-border text-sm font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none min-h-[48px]"
                />
                <UserIcon className="w-4 h-4 text-ink/40 absolute left-3 top-3.5" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="mobile-password"
                className="block text-xs font-heading font-semibold text-ink"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="mobile-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-10 py-3 rounded-card bg-surface border border-border text-sm font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none min-h-[48px]"
                />
                <Lock className="w-4 h-4 text-ink/40 absolute left-3 top-3.5" />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="mobile-login-submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-sm hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                'Authenticating...'
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Quick Demo Access Pills */}
        <div className="p-4 rounded-card bg-surface/80 border border-border space-y-2.5">
          <span className="block text-[11px] font-mono uppercase tracking-wider text-ink/60">
            Quick Demo Access (Tap to Fill):
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="mobile-quick-teacher"
              onClick={() => handleQuickFill('teacher1', 'password123')}
              className="px-3 py-2.5 rounded-pill bg-grape text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              📖 Teacher
            </button>
            <button
              type="button"
              id="mobile-quick-student"
              onClick={() => handleQuickFill('student1', 'password123')}
              className="px-3 py-2.5 rounded-pill bg-lime text-ink font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              🎓 Student
            </button>
            <button
              type="button"
              id="mobile-quick-superadmin"
              onClick={() => handleQuickFill('superadmin', 'password123')}
              className="px-3 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              ⚡ Super Admin
            </button>
            <button
              type="button"
              id="mobile-quick-schooladmin"
              onClick={() => handleQuickFill('schooladmin1', 'password123')}
              className="px-3 py-2.5 rounded-pill bg-ember text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              🏫 School Admin
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="pt-4 border-t border-border/60 text-center">
        <p className="text-[11px] text-ink/50 font-mono">
          Question Generation System • Touch Mobile Edition
        </p>
      </footer>
    </div>
  );
};
