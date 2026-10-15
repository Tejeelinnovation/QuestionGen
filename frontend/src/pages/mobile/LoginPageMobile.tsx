import React, { useState, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ArrowRight, Lock, User as UserIcon, Sparkles, Eye, EyeOff } from 'lucide-react';
import { InteractiveExam3DCard } from '../../components/landing/InteractiveExam3DCard';
import { LandingFeatures } from '../../components/landing/LandingFeatures';
import { LandingRoles } from '../../components/landing/LandingRoles';
import { LandingFaqAccordion } from '../../components/landing/LandingFaqAccordion';
import { LandingCTA } from '../../components/landing/LandingCTA';
import { ScrollReveal } from '../../components/landing/ScrollReveal';

export const LoginPageMobile: React.FC = () => {
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
    const formElement = document.getElementById('mobile-login-card');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      usernameInputRef.current?.focus();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* ── Mobile Top Brand Header ── */}
      <header className="sticky top-0 z-50 px-5 py-3.5 flex items-center justify-between border-b border-border bg-bg/95 backdrop-blur-sm animate-slide-down">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-sm tracking-tight text-ink">
            Question Generation System
          </span>
        </div>
        <button
          type="button"
          onClick={handleScrollToLogin}
          className="rounded-pill bg-forest text-white px-3.5 py-1.5 text-xs font-heading font-semibold shadow-xs cursor-pointer hover:bg-forest/90 active:scale-95 transition-all"
        >
          Sign In
        </button>
      </header>

      {/* ── Mobile Hero ── */}
      <section className="px-5 py-8 space-y-6 overflow-x-clip">
        <div className="space-y-2.5 text-left animate-slide-down">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest shadow-xs">
            <Sparkles className="w-3 h-3 text-ember" />
            <span>Modern School Examination Platform</span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink leading-tight tracking-tight">
            Create Balanced Question Papers in 3 Minutes.
          </h1>
          <p className="text-xs sm:text-sm text-ink/75 leading-relaxed">
            Assemble syllabus-aligned question papers, print clean exam sheets, or assign online tests with instant automatic grading.
          </p>
        </div>

        {/* ── Login Card ── */}
        <div
          id="mobile-login-card"
          className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4 animate-slide-up"
        >
          <div className="border-b border-border pb-2.5">
            <h2 className="font-heading font-bold text-base text-ink">
              Sign In to Your Workspace
            </h2>
            <p className="text-[11px] text-ink/60">
              For teachers, students, and administrators
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-card border border-ember/40 bg-ember/10 text-ember p-3 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="mobile-username"
                className="block text-xs font-heading font-semibold text-ink"
              >
                Username
              </label>
              <div className="relative">
                <input
                  ref={usernameInputRef}
                  id="mobile-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username..."
                  required
                  autoCapitalize="none"
                  className="w-full pl-9 pr-3 py-2.5 rounded-card bg-surface border border-border text-sm font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none"
                />
                <UserIcon className="w-4 h-4 text-ink/40 absolute left-3 top-3" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="mobile-password"
                  className="block text-xs font-heading font-semibold text-ink"
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
                  id="mobile-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  required
                  className="w-full pl-9 pr-10 py-2.5 rounded-card bg-surface border border-border text-sm font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none"
                />
                <Lock className="w-4 h-4 text-ink/40 absolute left-3 top-3" />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-ink/40 hover:text-ink p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs tracking-wide shadow-sm hover:bg-forest/90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isSubmitting ? 'Signing In...' : 'Sign In to Workspace'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* ── 3D Interactive Card Preview ── */}
        <div className="pt-2 animate-slide-up">
          <InteractiveExam3DCard className="w-full" />
        </div>
      </section>

      {/* ── Sections 2 to 5 ── */}
      <LandingFeatures />
      <LandingRoles />
      
      {/* ── FAQs on Mobile ── */}
      <section id="faqs" className="py-12 px-5 border-t border-border/60 bg-surface/30">
        <ScrollReveal direction="down" duration={600}>
          <div className="text-left space-y-2 mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest shadow-xs">
              <Sparkles className="w-3 h-3 text-ember" />
              <span>Common Questions</span>
            </div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Frequently Asked Questions
            </h2>
            <p className="text-xs text-ink/70">
              Everything you need to know about QuestionGen for your school.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal direction="up" delay={150} duration={600}>
          <LandingFaqAccordion />
        </ScrollReveal>
      </section>

      <LandingCTA onScrollToLogin={handleScrollToLogin} />

      {/* ── Mobile Footer ── */}
      <footer className="px-5 py-6 border-t border-border bg-bg text-center space-y-2 text-xs text-ink/65">
        <div>© {new Date().getFullYear()} Question Generation System</div>
        <div className="flex items-center justify-center gap-3 font-mono text-[11px]">
          <span className="text-forest font-semibold">● System Operational</span>
          <span>•</span>
          <Link to="/reset-password" className="hover:underline text-forest">
            Reset Password
          </Link>
        </div>
      </footer>
    </div>
  );
};
