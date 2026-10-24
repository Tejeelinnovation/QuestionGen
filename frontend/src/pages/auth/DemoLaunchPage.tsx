import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { TOKEN_STORAGE } from '../../api/client';
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight, XCircle, ShieldCheck } from 'lucide-react';

export const DemoLaunchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const ticket = searchParams.get('ticket');

  const [status, setStatus] = useState<'initializing' | 'activating' | 'success' | 'error'>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState<string>('/');

  const hasFired = useRef(false);

  useEffect(() => {
    // Set immediate professional title for demonstration & presentations
    document.title = 'Launching Demo Sandbox | Question Generation System';

    // Sever opener safely inside the new tab for session isolation
    try {
      window.opener = null;
    } catch {
      // ignore
    }

    if (hasFired.current) return;
    hasFired.current = true;

    if (!ticket) {
      setStatus('error');
      document.title = 'Demo Launch Error | Question Generation System';
      setErrorMessage('No demo session ticket was provided in the URL. Please launch from the Super Admin dashboard.');
      return;
    }

    const activateSession = async () => {
      setStatus('activating');
      try {
        // Enforce strict tab isolation: flush any inherited session tokens in this new tab
        TOKEN_STORAGE.clearTokens();

        const response = await authApi.consumeDemoTicket(ticket);
        TOKEN_STORAGE.setTokens(response.access, response.refresh);

        setRedirectPath(response.redirect_url || '/');
        setStatus('success');
        document.title = 'Demo Session Ready | Question Generation System';

        // Smooth redirect into isolated dashboard
        setTimeout(() => {
          window.location.replace(response.redirect_url || '/');
        }, 500);
      } catch (err: any) {
        console.error('Failed to consume demo launch ticket:', err);
        const detail =
          err.response?.data?.detail ||
          'The demo launch ticket is either expired or has already been consumed. Please launch a fresh sandbox from Super Admin.';
        setStatus('error');
        document.title = 'Demo Launch Error | Question Generation System';
        setErrorMessage(detail);
      }
    };

    activateSession();
  }, [ticket]);

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col items-center justify-center p-4 sm:p-6 font-body selection:bg-lime selection:text-ink">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-card p-6 sm:p-8 space-y-6 text-center animate-card-enter">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-xs uppercase tracking-wider text-forest">
            Question Generation System
          </span>
        </div>

        {/* Status Indicator */}
        {(status === 'initializing' || status === 'activating') && (
          <div className="space-y-4 py-4">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-forest/15 border-t-forest animate-spin" />
              <ShieldCheck className="w-6 h-6 text-forest absolute" />
            </div>
            <div className="space-y-1">
              <h2 className="font-heading font-bold text-xl text-ink">
                Initializing Isolated Sandbox
              </h2>
              <p className="text-xs text-ink/70 leading-relaxed max-w-xs mx-auto">
                Establishing an isolated session context. Your Super Admin session remains untouched.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-bg border border-border text-[11px] font-mono text-ink/60">
              <Loader2 className="w-3 h-3 animate-spin text-forest" />
              <span>Verifying cryptographic ticket...</span>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 py-4 animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-forest/10 border-2 border-forest text-forest mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="font-heading font-bold text-xl text-forest">
                Demo Session Ready!
              </h2>
              <p className="text-xs text-ink/70 leading-relaxed">
                Redirecting to isolated dashboard...
              </p>
            </div>
            <a
              href={redirectPath}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-colors shadow-2xs"
            >
              <span>Enter Dashboard Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-5 py-2">
            <div className="w-16 h-16 rounded-full bg-ember/10 border-2 border-ember text-ember mx-auto flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading font-bold text-xl text-ink">
                Demo Launch Failed
              </h2>
              <div className="p-3 rounded-card bg-ember/5 border border-ember/25 text-left text-xs text-ink/80 leading-relaxed">
                {errorMessage}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.close()}
                className="w-full sm:w-auto px-4 py-2 rounded-pill border border-border bg-surface text-ink/80 text-xs font-heading font-semibold hover:bg-surface-muted transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Close This Tab</span>
              </button>
              <Link
                to="/login"
                className="w-full sm:w-auto px-4 py-2 rounded-pill bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-colors shadow-2xs flex items-center justify-center gap-1.5"
              >
                <span>Return to Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Security badge footer */}
        <div className="pt-4 border-t border-border flex items-center justify-center gap-2 text-[10px] font-mono text-ink/50">
          <ShieldCheck className="w-3.5 h-3.5 text-forest" />
          <span>Tab-Isolated Sandbox • Single-Use Key</span>
        </div>
      </div>
    </div>
  );
};
