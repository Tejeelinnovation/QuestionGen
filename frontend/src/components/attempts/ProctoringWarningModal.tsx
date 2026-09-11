import React from 'react';
import type { ProctoringWarningState } from '../../hooks/useExamProctoring';

interface ProctoringWarningModalProps {
  warning: ProctoringWarningState | null;
  totalWarnings: number;
  maxWarnings?: number;
  onDismiss: () => void;
}

export const ProctoringWarningModal: React.FC<ProctoringWarningModalProps> = ({
  warning,
  totalWarnings,
  maxWarnings = 5,
  onDismiss,
}) => {
  if (!warning) return null;

  const isSevere = totalWarnings >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-surface border-2 border-ember/60 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-scale-in text-ink"
        role="alertdialog"
        aria-labelledby="proctoring-warning-title"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-ember/15 text-ember flex items-center justify-center text-2xl shrink-0">
            ⚠️
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-ember block">
              Proctoring Security Alert
            </span>
            <h3 id="proctoring-warning-title" className="font-heading font-bold text-xl text-ink">
              Warning #{warning.warningNumber} of {maxWarnings}
            </h3>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-bg border border-border space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-ink/60">
            <span>Event:</span>
            <span className="font-bold text-ember">{warning.eventType}</span>
          </div>
          <div className="flex justify-between text-ink/60">
            <span>Time:</span>
            <span className="text-ink">{warning.timestamp}</span>
          </div>
          <p className="text-ink/80 pt-1 border-t border-border/60 font-sans text-xs leading-relaxed">
            {warning.details}
          </p>
        </div>

        <div className="text-xs text-ink/70 leading-relaxed space-y-2 font-sans">
          <p>
            You navigated away from the active assessment screen or attempted an unauthorized shortcut.
            All proctoring events are strictly recorded in the official audit log for review by the Super Admin and course instructor.
          </p>
          {isSevere && (
            <p className="font-bold text-ember">
              Notice: Reaching {maxWarnings} warnings may result in automatic submission or invalidation of this assessment sitting.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3 px-4 rounded-pill bg-ember text-white font-heading font-bold text-xs hover:bg-ember/90 transition-all shadow-md active:scale-98 cursor-pointer"
        >
          I Understand & Return to Exam →
        </button>
      </div>
    </div>
  );
};
