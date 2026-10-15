import React from 'react';
import { ArrowUp, Sparkles, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from './ScrollReveal';

interface LandingCTAProps {
  onScrollToLogin: () => void;
}

export const LandingCTA: React.FC<LandingCTAProps> = ({ onScrollToLogin }) => {
  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-bg border-t border-border/60">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <ScrollReveal direction="zoom" duration={750}>
          <div className="rounded-2xl bg-forest text-white p-6 sm:p-8 lg:p-12 shadow-2xl relative overflow-hidden text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-6 lg:gap-8">
            
            {/* Subtle Background Glow */}
            <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-lime/10 blur-3xl pointer-events-none" />

            {/* Copy */}
            <div className="space-y-2.5 sm:space-y-3 max-w-xl relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-white/10 text-lime text-xs font-heading font-semibold border border-white/10">
                <Sparkles className="w-3.5 h-3.5" />
                Empowering Better School Assessments
              </div>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white tracking-tight">
                Ready to Upgrade Exam Preparation at Your School?
              </h2>
              <p className="font-body text-xs sm:text-sm text-white/80 leading-relaxed">
                Log in with your institutional credentials to assemble question papers, print clean tests, and evaluate student submissions.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={onScrollToLogin}
                className="w-full sm:w-auto rounded-pill bg-lime text-ink px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-heading font-bold hover:bg-lime/90 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Sign In to Workspace</span>
                <ArrowUp className="w-4 h-4" />
              </button>
              <Link
                to="/reset-password"
                className="w-full sm:w-auto rounded-pill bg-white/10 hover:bg-white/20 text-white border border-white/20 px-5 py-3 sm:py-3.5 text-xs sm:text-sm font-heading font-medium transition-colors text-center flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Reset Password</span>
              </Link>
            </div>

          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

