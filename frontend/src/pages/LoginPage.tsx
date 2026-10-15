import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { LoginPageTablet } from './tablet/LoginPageTablet';
import { LoginPageMobile } from './mobile/LoginPageMobile';
import { InteractiveExam3DCard } from '../components/landing/InteractiveExam3DCard';
import { LandingFeatures } from '../components/landing/LandingFeatures';
import { LandingRoles } from '../components/landing/LandingRoles';
import { LandingFaqAccordion } from '../components/landing/LandingFaqAccordion';
import { LandingCTA } from '../components/landing/LandingCTA';
import { AnimatedCounter } from '../components/landing/AnimatedCounter';
import { ScrollReveal } from '../components/landing/ScrollReveal';

const LoginPageDesktop: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement>(null);

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

  const handleScrollToLogin = () => {
    const formElement = document.getElementById('login-form-card');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      usernameInputRef.current?.focus();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-body selection:bg-lime selection:text-ink">
      {/* ── Persistent Top Navigation Bar (Slides in from Top) ── */}
      <header className="sticky top-0 z-50 px-6 sm:px-10 py-4 flex items-center justify-between border-b border-border/70 bg-bg/90 backdrop-blur-md animate-slide-down">
        <div className="flex items-center gap-3">
          <span className="w-3.5 h-3.5 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-lg sm:text-xl tracking-tight text-ink">
            Question Generation System
          </span>
        </div>

        {/* Navigation Anchors */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-heading font-semibold text-ink/75">
          <a href="#how-it-works" className="hover:text-forest transition-colors">
            How It Works
          </a>
          <a href="#roles" className="hover:text-forest transition-colors">
            For Schools
          </a>
          <a href="#faqs" className="hover:text-forest transition-colors">
            Questions & Answers
          </a>
        </nav>

        {/* Header Action */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleScrollToLogin}
            className="rounded-pill bg-forest text-white px-4 py-2 text-xs font-heading font-semibold hover:bg-forest/90 active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            Sign In to Portal →
          </button>
        </div>
      </header>

      {/* ── 1. HERO SECTION (Multi-Directional Entrances + Animated Counters) ── */}
      <section className="relative px-6 sm:px-10 py-12 lg:py-20 border-b border-border/60 overflow-hidden">
        {/* Soft background ambient gradient */}
        <div className="absolute top-10 right-1/4 w-96 h-96 rounded-full bg-forest/5 blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
          
          {/* Left Column: Slides in from the Left */}
          <div className="lg:col-span-7 space-y-8 animate-slide-left">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface border border-border text-xs font-semibold text-forest shadow-xs animate-slide-down">
                <Sparkles className="w-3.5 h-3.5 text-ember" />
                <span>The Modern Examination Platform for Schools</span>
              </div>

              <h1 className="font-heading font-bold text-4xl sm:text-5xl lg:text-[3.25rem] text-ink leading-[1.08] tracking-tight">
                Create Balanced Question Papers in{' '}
                <span className="underline decoration-lime decoration-4 underline-offset-4">3 Minutes</span>.
              </h1>

              <p className="font-body text-ink/75 text-base sm:text-lg max-w-xl leading-relaxed">
                Assemble syllabus-aligned test papers from verified question banks, print ready-to-use exam sheets, or assign online tests with instant automatic grading.
              </p>

              {/* Dynamic Number Counting Highlights */}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-heading font-medium text-ink/80">
                <span className="inline-flex items-center gap-1.5 bg-surface px-3.5 py-1.5 rounded-pill border border-border shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  <AnimatedCounter end={10000} suffix="+" duration={1800} className="font-bold text-forest" />
                  <span>Questions Bank</span>
                </span>
                <span className="inline-flex items-center gap-1.5 bg-surface px-3.5 py-1.5 rounded-pill border border-border shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  <AnimatedCounter end={3} suffix=" Mins" duration={1200} className="font-bold text-ember" />
                  <span>Assembly Speed</span>
                </span>
                <span className="inline-flex items-center gap-1.5 bg-surface px-3.5 py-1.5 rounded-pill border border-border shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  <AnimatedCounter end={100} suffix="%" duration={1500} className="font-bold text-forest" />
                  <span>Auto-Graded</span>
                </span>
              </div>
            </div>

            {/* ── High-Craft Institutional Login Form Card (Slides up from bottom) ── */}
            <div
              id="login-form-card"
              className="bg-surface border border-border rounded-xl p-6 sm:p-8 shadow-card max-w-lg transition-all animate-slide-up"
            >
              <div className="mb-5 flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <h2 className="font-heading font-bold text-xl text-ink tracking-tight">
                    Sign in to your school workspace
                  </h2>
                  <p className="text-xs text-ink/65 mt-0.5">
                    For teachers, students, and school administrators
                  </p>
                </div>
                <span className="pill pill-forest font-mono text-[10px]">Portal v2.4</span>
              </div>

              {errorMessage && (
                <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3.5 mb-5 text-xs font-medium flex items-start gap-2">
                  <span className="font-bold">!</span>
                  <span>{errorMessage}</span>
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
                    placeholder="Enter your username..."
                    required
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 transition-colors focus:bg-surface focus:border-forest focus:outline-none"
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
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="Enter your password..."
                      required
                      className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 pr-10 text-sm text-ink placeholder:text-ink/40 transition-colors focus:bg-surface focus:border-forest focus:outline-none"
                    />
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
                  id="login-submit-btn"
                  disabled={isSubmitting}
                  className="w-full mt-2 rounded-pill bg-forest text-white py-3 px-4 text-sm font-heading font-semibold hover:bg-forest/90 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
                >
                  <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-4 pt-3 border-t border-border/60 text-center">
                <span className="font-mono text-[11px] text-ink/50">
                  Secure Institutional Access • Role Protection Enforced
                </span>
              </div>
            </div>

          </div>

          {/* Right Column: Circular Orbit System & 3D Exam Sheet (Slides in from the Right) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center animate-slide-right">
            <InteractiveExam3DCard className="w-full" />
          </div>

        </div>
      </section>

      {/* ── 2. SOLUTION / VALUE PROPOSITION (3 Simple Steps with Directional Entrances) ── */}
      <LandingFeatures />

      {/* ── 3. SOCIAL PROOF & WHO IT'S FOR (Live Animated Counters) ── */}
      <LandingRoles />

      {/* ── 4. FAQS (Frequently Asked Questions) ── */}
      <section id="faqs" className="py-12 sm:py-16 lg:py-20 border-t border-border/60 bg-surface/30">
        <div className="max-w-5xl mx-auto px-6">
          <ScrollReveal direction="down" duration={700}>
            <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-ember" />
                Help & Answers
              </div>
              <h2 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="font-body text-sm sm:text-base text-ink/70 leading-relaxed">
                Clear answers to common questions asked by teachers and school administrators.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="up" delay={200} duration={700}>
            <LandingFaqAccordion />
          </ScrollReveal>
        </div>
      </section>

      {/* ── 5. FINAL CALL TO ACTION (CTA) ── */}
      <LandingCTA onScrollToLogin={handleScrollToLogin} />

      {/* ── FOOTER BAR ── */}
      <footer className="px-6 sm:px-10 py-6 border-t border-border/70 bg-bg text-xs text-ink/65 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-forest" />
          <span className="font-heading font-semibold text-ink">
            Question Generation System
          </span>
          <span className="text-ink/40">•</span>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span className="text-forest font-semibold">● System Operational</span>
          <span className="text-ink/40">•</span>
          <Link to="/reset-password" className="hover:underline text-ink/75">
            Reset Password
          </Link>
        </div>
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
