import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { PaperVersion, QuestionSnapshotItem } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { Lock, Send, Printer, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { SkeletonPaperDetail } from '../../../components/ui/skeleton';
import { MathText } from '../../../components/ui/MathText';
import { API_BASE_URL } from '../../../api/client';
import { groupVersionQuestionsIntoSections, isRtlText } from '../../../utils/versionSectionUtils';

const resolveImgUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const VersionDetailPageMobile: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const navigate = useNavigate();
  const { hasCapability } = useAuth();

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCloneSame = async () => {
    setIsCloning(true);
    setErrorMessage(null);
    try {
      const cloned = await papersApi.cloneVersion(paperId, vId, {});
      setSuccessMessage(`Created clone Version ${cloned.version_label}.`);
      setIsCloning(false);
      navigate(`/papers/${paperId}/versions/${cloned.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to clone version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
      setIsCloning(false);
    }
  };

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
    return <SkeletonPaperDetail />;
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
  const groupedSections = groupVersionQuestionsIntoSections(questions);

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
            <div className="text-xs text-ink/60 break-words [overflow-wrap:anywhere]">
              {(version.paper_title || '').replace(/_/g, ' ')}
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

        {hasCapability('CREATE_PAPER') && (
          <button
            type="button"
            id="mobile-clone-version-btn"
            onClick={handleCloneSame}
            disabled={actionLoading || isCloning}
            className={`w-full py-3 px-4 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px] shadow-xs active:scale-95 ${
              isCloning
                ? 'bg-ink text-white font-bold'
                : 'border border-border bg-surface text-ink hover:bg-surface-muted hover:border-forest/50'
            }`}
          >
            {isCloning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-lime" />
                <span>Cloning Version...</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-forest" />
                <span>Clone as Alternate Shift Version</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Structured Exam Sections ── */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>EXAM SECTIONS ({groupedSections.length})</span>
          <span>{questions.length} Questions</span>
        </div>

        {groupedSections.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No questions assigned to this version.
          </div>
        ) : (
          groupedSections.map((sec) => (
            <div key={sec.code} className="space-y-2.5">
              {/* Mobile Section Header Banner */}
              <div className="p-3 bg-surface-muted/60 border border-border/90 rounded-card flex flex-col gap-1.5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading font-bold text-xs text-ink">
                    {sec.title}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-forest bg-forest/10 border border-forest/20 px-2 py-0.5 rounded-pill shrink-0">
                    {sec.questions.length} Qs • {sec.totalMarks} M
                  </span>
                </div>
                {sec.instructions && (
                  <p className="text-[11px] text-ink/70 italic font-serif leading-tight">
                    {sec.instructions}
                  </p>
                )}
              </div>

              {/* Questions in Section */}
              <div className="space-y-2">
                {sec.questions.map((q, qIdx) => (
                  <div
                    key={q.question_id || qIdx}
                    className="p-3 rounded-card bg-surface border border-border shadow-xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-forest bg-forest/10 px-1.5 py-0.5 rounded-sm">
                          Q{(q.displayNum || (qIdx + 1)) < 10 ? `0${q.displayNum || (qIdx + 1)}` : (q.displayNum || (qIdx + 1))}
                        </span>
                        <span className="pill pill-muted text-[10px] py-0.5">
                          {q.question_type}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-pill">
                        {q.marks || 1} mark{(q.marks || 1) === 1 ? '' : 's'}
                      </span>
                    </div>

                    {q.case_study_passage && (
                      <div
                        className={`p-2.5 rounded-card bg-sky-50 border-l-4 border-sky-600 text-[11px] text-ink/85 italic leading-relaxed break-words [overflow-wrap:anywhere] ${
                          isRtlText(q.case_study_passage) ? 'border-l-0 border-r-4 text-right' : ''
                        }`}
                        dir={isRtlText(q.case_study_passage) ? 'rtl' : 'ltr'}
                      >
                        <strong className="block not-italic font-heading font-semibold text-sky-900 mb-1">
                          {isRtlText(q.case_study_passage) ? 'مطالعہ عبارت / CASE STUDY PASSAGE:' : 'CASE STUDY / COMPREHENSION PASSAGE:'}
                        </strong>
                        <MathText text={q.case_study_passage} as="div" />
                      </div>
                    )}

                    <div className="text-xs text-ink leading-relaxed font-body">
                      <MathText text={q.question_text} as="p" />
                    </div>

                    {/* Diagram Display if attached */}
                    {q.diagram && q.diagram.image_url && (
                      <div className="py-2 flex flex-col items-center justify-center bg-bg/50 border border-border/60 rounded p-1.5">
                        <img
                          src={resolveImgUrl(q.diagram.image_url)}
                          alt={q.diagram.title || 'Question Diagram'}
                          className="max-h-40 max-w-full object-contain border border-border rounded"
                          onError={(e) => {
                            const cur = (e.currentTarget as HTMLImageElement).src;
                            if (!cur.includes(':8000') && q.diagram?.image_url?.startsWith('/')) {
                              (e.currentTarget as HTMLImageElement).src = `http://127.0.0.1:8000${q.diagram.image_url}`;
                            }
                          }}
                        />
                        {q.diagram.title && (
                          <span className="text-[10px] font-mono text-ink/60 mt-0.5 italic">
                            {q.diagram.title}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Options for MCQ */}
                    {q.options && Object.keys(q.options).length > 0 && (
                      <div className="grid grid-cols-1 gap-1.5 pt-1">
                        {Object.entries(q.options).map(([optKey, optVal]) => (
                          <div
                            key={optKey}
                            className="p-1.5 rounded border border-border/70 bg-bg text-[11px] flex items-baseline gap-1.5"
                            dir="auto"
                          >
                            <span className="font-mono font-bold text-forest">({optKey})</span>
                            <MathText text={optVal} as="span" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
