import React, { useEffect, useState } from 'react';
import { contentApi } from '../../api/content';
import type { QuestionValidationHistoryItem } from '../../types';
import { X, Clock, CheckCircle2, AlertTriangle, XCircle, Edit3, Send, History } from 'lucide-react';

interface ValidationHistoryDrawerProps {
  questionId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ValidationHistoryDrawer: React.FC<ValidationHistoryDrawerProps> = ({
  questionId,
  isOpen,
  onClose,
}) => {
  const [history, setHistory] = useState<QuestionValidationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && questionId) {
      setIsLoading(true);
      setErrorMessage(null);
      contentApi
        .getValidationHistory(questionId)
        .then(setHistory)
        .catch((err: any) => {
          setErrorMessage(err.response?.data?.detail || 'Failed to load validation history.');
        })
        .finally(() => setIsLoading(false));
    } else {
      setHistory([]);
    }
  }, [isOpen, questionId]);

  if (!isOpen || !questionId) return null;

  const getActionMeta = (action: string) => {
    switch (action) {
      case 'SUBMIT':
        return {
          icon: <Send className="w-3.5 h-3.5 text-amber-600" />,
          label: 'Submitted for Validation',
          color: 'text-amber-700 bg-amber-50 border-amber-200',
        };
      case 'START_VALIDATION':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-blue-600" />,
          label: 'Validation Started',
          color: 'text-blue-700 bg-blue-50 border-blue-200',
        };
      case 'METADATA_UPDATE':
        return {
          icon: <Edit3 className="w-3.5 h-3.5 text-forest" />,
          label: 'Metadata Updated',
          color: 'text-forest bg-forest/10 border-forest/20',
        };
      case 'SEND_FOR_CORRECTION':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-ember" />,
          label: 'Returned for Correction',
          color: 'text-ember bg-ember/10 border-ember/20',
        };
      case 'RESUBMIT':
        return {
          icon: <Send className="w-3.5 h-3.5 text-sky-600" />,
          label: 'Corrected & Resubmitted',
          color: 'text-sky-700 bg-sky-50 border-sky-200',
        };
      case 'APPROVE':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-forest" />,
          label: 'Approved for Bank',
          color: 'text-forest bg-forest/15 border-forest/30',
        };
      case 'REJECT':
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-red-600" />,
          label: 'Rejected',
          color: 'text-red-700 bg-red-50 border-red-200',
        };
      default:
        return {
          icon: <History className="w-3.5 h-3.5 text-ink/60" />,
          label: action,
          color: 'text-ink/70 bg-surface border-border',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Sheet */}
      <div className="relative w-full max-w-md bg-surface border-l border-border shadow-float h-full flex flex-col z-10 animate-slide-left">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-surface-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-ink">Validation Audit Trail</h3>
              <p className="text-[11px] font-mono text-ink/50">Question #{questionId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="py-12 text-center text-xs text-ink/50 font-mono">
              Loading audit timeline...
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-card bg-ember/10 border border-ember/20 text-ember text-xs">
              {errorMessage}
            </div>
          )}

          {!isLoading && history.length === 0 && !errorMessage && (
            <div className="py-12 text-center text-xs text-ink/40">
              No validation activity recorded yet.
            </div>
          )}

          {!isLoading && history.length > 0 && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {history.map((item) => {
                const meta = getActionMeta(item.action);
                const hasDiffs = item.changed_fields && Object.keys(item.changed_fields).length > 0;

                return (
                  <div key={item.id} className="relative group">
                    {/* Timeline Node Dot */}
                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-surface border-2 border-forest flex items-center justify-center shadow-xs" />

                    <div className="bg-surface border border-border rounded-card p-3.5 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-[11px] font-semibold border ${meta.color}`}
                        >
                          {meta.icon}
                          <span>{meta.label}</span>
                        </span>
                        <span className="font-mono text-[10px] text-ink/50">
                          Rev #{item.revision}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-ink/60 font-mono">
                        <span>
                          {item.actor_username || 'System'}{' '}
                          {item.actor_role ? `(${item.actor_role})` : ''}
                        </span>
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                      </div>

                      {item.comment && (
                        <div className="p-2.5 rounded-card bg-surface-muted/50 border border-border text-xs text-ink/90 whitespace-pre-wrap">
                          <span className="font-semibold text-ink block text-[11px] mb-0.5">Comment:</span>
                          {item.comment}
                        </div>
                      )}

                      {hasDiffs && (
                        <div className="p-2.5 rounded-card bg-bg border border-border text-[11px] font-mono space-y-1">
                          <span className="font-sans font-semibold text-[10px] uppercase text-ink/60 block">
                            Field Modifications:
                          </span>
                          {Object.entries(item.changed_fields).map(([field, diff]: [string, any]) => (
                            <div key={field} className="text-ink/80 flex items-center justify-between">
                              <span className="capitalize">{field.replace('_', ' ')}:</span>
                              <span className="text-ink/90">
                                <span className="line-through text-ember mr-1">
                                  {typeof diff?.old === 'object' ? JSON.stringify(diff.old) : String(diff?.old ?? 'none')}
                                </span>
                                →{' '}
                                <span className="text-forest font-semibold">
                                  {typeof diff?.new === 'object' ? JSON.stringify(diff.new) : String(diff?.new ?? 'none')}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
