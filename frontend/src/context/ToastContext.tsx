import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, duration = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((msg: string, dur?: number) => showToast('success', msg, dur), [showToast]);
  const error = useCallback((msg: string, dur?: number) => showToast('error', msg, dur), [showToast]);
  const info = useCallback((msg: string, dur?: number) => showToast('info', msg, dur), [showToast]);
  const warning = useCallback((msg: string, dur?: number) => showToast('warning', msg, dur), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning, removeToast }}>
      {children}

      {/* Floating Toasts Container: Top Center of Viewport */}
      <aside
        aria-live="polite"
        aria-label="Notifications"
        className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2.5 max-w-lg w-[calc(100%-2rem)] pointer-events-none"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-card border shadow-lg backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 w-full ${
                isSuccess
                  ? 'bg-[#F0FDF4] text-[#166534] border-[#BBF7D0] shadow-green-900/5'
                  : isError
                  ? 'bg-[#FFF5F5] text-[#991B1B] border-[#FECACA] shadow-red-900/5'
                  : isWarning
                  ? 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A] shadow-amber-900/5'
                  : 'bg-[#F0F9FF] text-[#075985] border-[#BAE6FD] shadow-blue-900/5'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />}
                {isError && <AlertCircle className="w-5 h-5 text-[#DC2626]" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-[#D97706]" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-[#0284C7]" />}
              </div>

              <div className="flex-1 text-xs sm:text-sm font-medium leading-snug">
                {toast.message}
              </div>

              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className={`shrink-0 p-1 rounded-sm transition-colors cursor-pointer -mr-1 -mt-1 ${
                  isSuccess
                    ? 'text-[#166534]/60 hover:text-[#166534] hover:bg-green-100/60'
                    : isError
                    ? 'text-[#991B1B]/60 hover:text-[#991B1B] hover:bg-red-100/60'
                    : isWarning
                    ? 'text-[#92400E]/60 hover:text-[#92400E] hover:bg-amber-100/60'
                    : 'text-[#075985]/60 hover:text-[#075985] hover:bg-blue-100/60'
                }`}
                title="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
