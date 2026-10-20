import React from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface RouteErrorBoundaryProps {
  title?: string;
  subtitle?: string;
}

export const RouteErrorBoundary: React.FC<RouteErrorBoundaryProps> = ({
  title = 'Something went wrong',
  subtitle = 'An unexpected error occurred while rendering this page.',
}) => {
  const error = useRouteError();
  const [showDetails, setShowDetails] = React.useState(false);

  let errorMessage = 'An unexpected application error occurred.';
  let statusCode: number | null = null;
  let errorStack: string | undefined;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    errorMessage = error.statusText || error.data?.message || errorMessage;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6 font-body animate-fade-in">
      <div className="max-w-lg w-full bg-surface border border-border rounded-2xl shadow-float p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-lg sm:text-xl text-ink">
                {statusCode ? `Error ${statusCode}` : title}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-ink/60 mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-muted/60 border border-border/80 text-xs text-ink/80 font-mono break-words leading-relaxed">
          {errorMessage}
        </div>

        {errorStack && (
          <div className="border border-border/60 rounded-xl overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setShowDetails(prev => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-surface-muted/40 hover:bg-surface-muted/80 text-ink/70 hover:text-ink transition-colors cursor-pointer text-left"
            >
              <span className="font-medium text-[11px] tracking-wide uppercase font-mono">
                {showDetails ? 'Hide Diagnostics' : 'Show Diagnostics'}
              </span>
              {showDetails ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showDetails && (
              <pre className="p-3 text-[10.5px] leading-relaxed font-mono bg-ink/5 text-ink/70 max-h-48 overflow-auto whitespace-pre-wrap break-all border-t border-border/40">
                {errorStack}
              </pre>
            )}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleReload}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Page</span>
          </button>

          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs hover:bg-ink hover:text-white transition-all cursor-pointer active:scale-95"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

// Generic Class Component Error Boundary for Subtree Wrapping
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI Error caught by AppErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-surface-muted/30 font-body">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl shadow-float p-8 space-y-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="font-heading font-bold text-lg text-ink">Application Error</h2>
              <p className="text-xs text-ink/60">
                A client-side error occurred. Please reload to restore normal operation.
              </p>
            </div>
            {this.state.error?.message && (
              <div className="p-3 rounded-xl bg-surface-muted text-xs font-mono text-ink/70 break-words text-left">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
