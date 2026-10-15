import React, { useState, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { InteractiveExam3DCard } from '../../components/landing/InteractiveExam3DCard';
import { LandingFeatures } from '../../components/landing/LandingFeatures';
import { LandingRoles } from '../../components/landing/LandingRoles';
import { LandingFaqAccordion } from '../../components/landing/LandingFaqAccordion';
import { LandingCTA } from '../../components/landing/LandingCTA';
import { ScrollReveal } from '../../components/landing/ScrollReveal';

export const LoginPageTablet: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement>(null);

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

  const handleScrollToLogin = () => {
    const formElement = document.getElementById('tablet-login-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      usernameInputRef.current?.focus();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* Top Header */}
      <header className="sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between border-b border-border bg-bg/90 backdrop-blur-md animate-slide-down">
        <div className="flex items-center gap-2.5">
          <span className="w-3.5 h-3.5 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-lg tracking-tight text-ink">
            Question Generation System
          </span>
        </div>

        <nav className="flex items-center gap-6 text-xs font-heading font-semibold text-ink/75">
          <a href="#how-it-works" className="hover:text-forest transition-colors">
            How It Works
          </a>
          <a href="#roles" className="hover:text-forest transition-colors">
            For Schools
          </a>
          <a href="#faqs" className="hover:text-forest transition-colors">
            FAQs
          </a>
        </nav>

        <button
          type="button"
          onClick={handleScrollToLogin}
          className="rounded-pill bg-forest text-white px-4 py-2 text-xs font-heading font-semibold shadow-xs cursor-pointer hover:bg-forest/90 active:scale-95 transition-all"
        >
          Sign In →
        </button>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-10 border-b border-border/60 overflow-hidden">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3 animate-slide-down">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface border border-border text-xs font-semibold text-forest shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-ember" />
              <span>Modern Examination Platform for Schools</span>
            </div>
            <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink leading-tight tracking-tight">
              Create Balanced Question Papers in 3 Minutes.
            </h1>
            <p className="text-sm text-ink/75 max-w-xl mx-auto leading-relaxed">
              Assemble syllabus-aligned test papers, print ready-to-use exam sheets, or assign online tests with instant automatic grading.
            </p>
          </div>

          {/* 2-Column Grid: Form + 3D Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center pt-2">
            {/* Form */}
            <div
              id="tablet-login-form"
              className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4 animate-slide-left"
            >
              <div>
                <h2 className="font-heading font-bold text-xl text-ink">Sign in to your portal</h2>
                <p className="text-xs text-ink/60 mt-0.5">For teachers, students, and administrators</p>
              </div>

              {errorMessage && (
                <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="username"
                    className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider mb-1"
                  >
                    Username
                  </label>
                  <input
                    ref={usernameInputRef}
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Enter username..."
                    required
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="password"
                      className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                    >
                      Password
                    </label>
                    <Link
                      to="/reset-password"
                      className="text-[11px] font-heading font-medium text-forest hover:underline"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="Enter password..."
                      required
                      className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 pr-10 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink p-1 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 rounded-pill bg-forest text-white py-3 px-4 text-sm font-heading font-semibold hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* 3D Card Preview */}
            <div className="flex justify-center animate-slide-right">
              <InteractiveExam3DCard className="w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Sections 2 to 5 */}
      <LandingFeatures />
      <LandingRoles />
      <section id="faqs" className="py-12 px-6 border-t border-border/60 bg-surface/30">
        <ScrollReveal direction="down" duration={700}>
          <div className="text-center max-w-xl mx-auto space-y-2 mb-10">
            <h2 className="font-heading font-bold text-2xl sm:text-3xl text-ink">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-ink/70">
              Common questions answered simply for schools and educators.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal direction="up" delay={200} duration={700}>
          <LandingFaqAccordion />
        </ScrollReveal>
      </section>
      <LandingCTA onScrollToLogin={handleScrollToLogin} />

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-border text-xs text-ink/65 flex flex-col sm:flex-row justify-between items-center gap-2">
        <span>© {new Date().getFullYear()} Question Generation System. All rights reserved.</span>
        <span className="font-mono text-[11px] text-forest font-semibold">● System Operational</span>
      </footer>
    </div>
  );
};
