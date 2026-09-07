import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { PaperVersion, QuestionSnapshotItem } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { Lock, Send, Printer, CheckCircle2 } from 'lucide-react';

export const VersionDetailPageMobile: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const { hasCapability } = useAuth();

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchVersion = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await papersApi.getPaperVersion(paperId, vId);
      setVersion(data);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load paper version details.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (paperId && vId) {
      fetchVersion();
    }
  }, [paperId, vId]);

  const handleFinalize = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setActionLoading(true);
    try {
      const updated = await papersApi.finalizeVersion(paperId, vId);
      setVersion(updated);
      setSuccessMessage(`Version ${updated.version_label} locked for delivery.`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to finalize version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-xs text-ink/60 font-body">
        Loading version details...
      </div>
    );
  }

  if (errorMessage || !version) {
    return (
      <div className="space-y-4 font-body">
        <PaperWorkflowNavMobile currentStep="version" paperId={paperId} backTo={`/papers/${paperId}`} />
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage || 'Version not found.'}
        </div>
      </div>
    );
  }

  const isFinal = version.status === 'FINALIZED';
  const questions: QuestionSnapshotItem[] = version.question_snapshot || [];

  return (
    <div className="space-y-4 font-body">
      <PaperWorkflowNavMobile
        currentStep="version"
        paperId={paperId}
        paperTitle={version.paper_title || `Paper #${paperId}`}
        backTo={`/papers/${paperId}`}
      />

      {/* Version Header Card */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h1 className="font-heading font-bold text-lg text-ink">
              Version {version.version_label}
            </h1>
            <div className="text-xs text-ink/60">
              {version.paper_title}
            </div>
          </div>
          <span
            className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
              isFinal ? 'pill-forest' : 'pill-muted'
            }`}
          >
            {isFinal ? 'Locked & Finalized' : 'Draft Version'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs font-mono text-ink/70">
          <span>{questions.length} Questions</span>
          <span>{version.total_marks || 0} Total Marks</span>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {!isFinal ? (
          <button
            type="button"
            id="mobile-finalize-btn"
            onClick={handleFinalize}
            disabled={actionLoading}
            className="w-full py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-50"
          >
            <Lock className="w-4 h-4 text-lime" />
            <span>{actionLoading ? 'Locking...' : 'Finalize & Lock Version'}</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {hasCapability('ASSIGN_TEST') && (
              <Link
                to={`/papers/${paperId}/versions/${vId}/deliver`}
                id="mobile-schedule-delivery-btn"
                className="py-3 px-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5 min-h-[48px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Deliver Test</span>
              </Link>
            )}
            <Link
              to={`/papers/${paperId}/versions/${vId}/print`}
              id="mobile-print-view-btn"
              className="py-3 px-3 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs hover:bg-surface-muted active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <Printer className="w-3.5 h-3.5 text-ink/60" />
              <span>Print View</span>
            </Link>
          </div>
        )}
      </div>

      {/* Questions Feed */}
      <div className="space-y-2.5 pt-1">
        <div className="text-xs text-ink/60 px-1 font-mono">
          <span>QUESTIONS IN VERSION ({questions.length})</span>
        </div>

        {questions.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No questions assigned to this version.
          </div>
        ) : (
          questions.map((q, idx) => (
            <div
              key={q.question_id || idx}
              className="p-3 rounded-card bg-surface border border-border shadow-xs space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono font-bold text-forest">Q{idx + 1}</span>
                <span className="pill pill-muted text-[10px] py-0.5">
                  {q.marks || 1} mark{(q.marks || 1) === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-ink leading-relaxed font-body">
                {q.question_text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
