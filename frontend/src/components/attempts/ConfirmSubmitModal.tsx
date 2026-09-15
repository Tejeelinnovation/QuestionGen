import React from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';

interface ConfirmSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  answeredCount: number;
  totalQuestions: number;
  formattedTimeRemaining: string;
  isTimeUrgent?: boolean;
}

export const ConfirmSubmitModal: React.FC<ConfirmSubmitModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  answeredCount,
  totalQuestions,
  formattedTimeRemaining,
  isTimeUrgent,
}) => {
  if (!isOpen) return null;

  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-surface border border-border rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-scale-in text-ink"
        role="dialog"
        aria-labelledby="confirm-submit-title"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center text-xl shrink-0">
            <CheckCircle2 className="w-6 h-6 text-forest" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-forest block">
              Final Examination Step
            </span>
            <h3 id="confirm-submit-title" className="font-heading font-bold text-xl text-ink">
              Submit Your Assessment?
            </h3>
          </div>
        </div>

        {/* Summary Card */}
        <div className="p-4 rounded-xl bg-surface-muted/60 border border-border text-xs font-mono space-y-2">
          <div className="flex items-center justify-between text-ink/75">
            <span>Completed Questions:</span>
            <span className="font-bold text-ink">
              {answeredCount} of {totalQuestions}
            </span>
          </div>

          {unansweredCount > 0 && (
            <div className="flex items-center justify-between text-ember font-semibold pt-1 border-t border-border/40">
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Unanswered Questions:</span>
              </span>
              <span>{unansweredCount} remaining</span>
            </div>
          )}

          <div className="flex items-center justify-between text-ink/75 pt-1 border-t border-border/40">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-forest" />
              <span>Time Remaining:</span>
            </span>
            <span
              className={`font-bold ${isTimeUrgent ? 'text-ember font-mono animate-pulse' : 'text-forest font-mono'}`}
            >
              {formattedTimeRemaining}
            </span>
          </div>
        </div>

        <p className="text-xs text-ink/70 leading-relaxed font-sans">
          Once confirmed, your responses will be permanently locked and submitted for evaluation. You cannot return or edit answers after submission.
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-pill border border-border text-xs font-heading font-semibold text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            Continue Writing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-pill bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <span>Confirm & Submit</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
