import React, { useEffect } from 'react';
import { Trash2, AlertCircle, X, FileText, Loader2, AlertTriangle } from 'lucide-react';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  itemName?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isDeleting?: boolean;
  error?: string | null;
  warningNote?: string;
}

/**
 * Universal Responsive Confirm Delete Modal.
 * Tailored for Desktop, Tablet, and Mobile viewport standards:
 * - Mobile: bottom-drawer layout with touch-friendly 44px buttons
 * - Tablet/Desktop: centered modal with backdrop blur & Escape key listener
 * - Follows QuestionGen Design System (Space Grotesk, Ember accent, warm borders)
 */
export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Remove Submission',
  itemName,
  description = 'Are you sure you want to remove this submission? All extracted chapters, LaTeX formulas, diagrams, and datasets will be permanently deleted.',
  confirmText = 'Delete Submission',
  cancelText = 'Cancel',
  isDeleting = false,
  error = null,
  warningNote = 'This action is irreversible. Extracted records cannot be recovered.',
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Lock body scroll while modal is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button (X) */}
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 p-1.5 text-ink/40 hover:text-ink rounded-lg hover:bg-surface-muted transition-colors disabled:opacity-40 cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 pr-6">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-ember/10 border border-ember/20 text-ember flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider font-bold text-ember block mb-0.5">
              Permanent Action
            </span>
            <h3 id="confirm-delete-title" className="font-heading font-bold text-lg sm:text-xl text-ink leading-tight">
              {title}
            </h3>
          </div>
        </div>

        {/* Item identifier banner */}
        {itemName && (
          <div className="p-3 rounded-xl bg-surface-muted/80 border border-border flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-ink/50 shrink-0" />
            <span className="font-mono text-xs font-semibold text-ink truncate flex-1" title={itemName}>
              {itemName}
            </span>
          </div>
        )}

        {/* Description */}
        <p className="text-xs sm:text-sm text-ink/75 leading-relaxed">
          {description}
        </p>

        {/* Warning Callout */}
        {warningNote && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-[11px] sm:text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-medium">{warningNote}</span>
          </div>
        )}

        {/* Inline Error Message */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="flex-1 break-words">{error}</span>
          </div>
        )}

        {/* Responsive Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-pill border border-border bg-surface text-ink/80 hover:bg-surface-muted hover:text-ink font-heading font-semibold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="w-full sm:w-auto px-5 py-2.5 rounded-pill bg-ember hover:bg-ember/90 text-white font-heading font-semibold text-xs sm:text-sm transition-all shadow-xs min-h-[44px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
