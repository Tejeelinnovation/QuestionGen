import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

export const LoginPageTablet: React.FC = () => {
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
    <div className="min-h-screen bg-bg text-ink flex flex-col justify-between p-6 sm:p-8 font-body selection:bg-lime selection:text-ink">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-3.5 h-3.5 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-xl tracking-tight text-ink">
            Question Generation <span className="text-forest font-mono text-xs">/tablet</span>
          </span>
        </div>
        <span className="pill pill-forest text-xs font-mono">Tablet Studio Edition</span>
      </header>

      {/* 2-Column Bento Reflow for Tablet */}
      <main className="my-auto py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Left Column: Editorial & Touch Demo Access */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
                <span className="w-2 h-2 rounded-full bg-lime" />
                Adaptive Educational Intelligence
              </div>
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink leading-tight tracking-tight">
                Curate with precision. Assess with clarity.
              </h1>
              <p className="text-sm text-ink/75 leading-relaxed">
                Bloom’s taxonomy balancing, dynamic syllabus coverage, and multi-school examination workflows on tablet.
              </p>
            </div>

            {/* Quick-fill demo account pills (Touch-first: min-h-[44px]) */}
            <div className="p-4 rounded-card bg-surface border border-border space-y-2.5">
              <span className="block text-xs font-mono uppercase tracking-wider text-ink/60">
                Quick Demo Access (Tap Role):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('superadmin', 'password123')}
                  className="px-3.5 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ Super Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('schooladmin1', 'password123')}
                  className="px-3.5 py-2.5 rounded-pill bg-ember text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ School Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('teacher1', 'password123')}
                  className="px-3.5 py-2.5 rounded-pill bg-grape text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ Teacher
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('student1', 'password123')}
                  className="px-3.5 py-2.5 rounded-pill bg-lime text-ink font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ Student
                </button>
                <button
                  type="button"
                  id="tab-quick-deo"
                  onClick={() => handleQuickFill('deo1', 'password123')}
                  className="px-3.5 py-2.5 rounded-pill bg-[#E8632C]/15 border border-[#E8632C]/30 text-[#E8632C] font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ DEO
                </button>
                <button
                  type="button"
                  id="tab-quick-validator"
                  onClick={() => handleQuickFill('validator1', 'password123')}
                  className="px-3.5 py-2.5 rounded-pill bg-[#1F4D3A]/15 border border-[#1F4D3A]/30 text-[#1F4D3A] font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ Validator
                </button>
                <button
                  type="button"
                  id="tab-quick-dual"
                  onClick={() => handleQuickFill('dualuser1', 'password123')}
                  className="col-span-2 px-3.5 py-2.5 rounded-pill bg-indigo-50 border border-indigo-200 text-indigo-800 font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ Dual Role (DEO + Validator)
                </button>
                <button
                  type="button"
                  id="tab-quick-qbm"
                  onClick={() => handleQuickFill('qbm1', 'password123')}
                  className="col-span-2 px-3.5 py-2.5 rounded-pill bg-[#0F766E] text-white font-heading font-semibold text-xs active:scale-95 transition-transform min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ⚡ QBM (Global)
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Touch Credentials Form */}
          <div className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-card space-y-5">
            <div>
              <h2 className="font-heading font-bold text-2xl text-ink">Sign in</h2>
              <p className="text-xs text-ink/60 mt-1">Access your institutional workspace</p>
            </div>

            {errorMessage && (
              <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3.5 text-xs font-medium flex items-start gap-2">
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
                  required
                  className="w-full rounded-card border border-border bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none min-h-[48px]"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Enter password..."
                    required
                    className="w-full rounded-card border border-border bg-bg px-4 py-3 pr-12 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none min-h-[48px]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1.5 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="login-submit-btn"
                disabled={isSubmitting}
                className="w-full mt-2 rounded-pill bg-forest text-white py-3.5 px-4 text-sm font-heading font-semibold hover:bg-forest/90 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 min-h-[48px] flex items-center justify-center"
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In to Tablet Workspace →'}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-ink/50 border-t border-border pt-4">
        © {new Date().getFullYear()} Question Generation System • Tablet Breakpoint (768–1024px)
      </footer>
    </div>
  );
};
