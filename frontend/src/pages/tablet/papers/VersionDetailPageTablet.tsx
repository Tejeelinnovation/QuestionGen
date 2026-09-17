import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { PaperVersion } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';
import { Loader2, Copy } from 'lucide-react';

export const VersionDetailPageTablet: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const navigate = useNavigate();
  const { hasCapability } = useAuth();

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
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
        err.response?.data?.detail || 'Failed to load paper version details from server.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsFinalizing(false);
    setIsCloning(false);
    if (paperId && vId) {
      fetchVersion();
    }
  }, [paperId, vId]);

  const handleFinalize = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFinalizing(true);
    try {
      const updated = await papersApi.finalizeVersion(paperId, vId);
      setVersion(updated);
      setSuccessMessage(`Version ${updated.version_label} has been finalized and locked for delivery.`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        (typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data)) ||
        'Failed to finalize version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleCloneSame = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsCloning(true);
    try {
      const cloned = await papersApi.cloneVersion(paperId, vId, {});
      setIsCloning(false);
      navigate(`/papers/${paperId}/versions/${cloned.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to clone version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
      setIsCloning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="version" paperId={paperId} versionId={vId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60 text-sm">
          Loading version snapshot...
        </div>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="version" paperId={paperId} versionId={vId} />
        <div className="p-4 space-y-4">
          {errorMessage && (
            <div
              id="version-error-banner"
              className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium"
            >
              {errorMessage}
            </div>
          )}
          <Link
            to={`/papers/${paperId}`}
            className="text-xs font-heading font-semibold text-forest hover:underline"
          >
            ← Back to Paper Versions
          </Link>
        </div>
      </div>
    );
  }

  const isFinalized = version.status === 'FINALIZED';
  const canCreatePaper = hasCapability('CREATE_PAPER');
  const canAssignTest = hasCapability('ASSIGN_TEST');
  const questionCount = version.question_snapshot?.length || version.question_count || 0;

  return (
    <div className="space-y-6 font-body pb-16">
      <PaperWorkflowNavTablet
        currentStep="version"
        paperId={paperId}
        paperTitle={version.paper_title}
        versionId={vId}
        versionLabel={version.version_label}
      />

      {errorMessage && (
        <div
          id="version-error-banner"
          className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium"
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          id="version-success-banner"
          className="rounded-card border border-forest/30 bg-forest/10 text-forest p-4 text-xs font-semibold flex items-center gap-2"
        >
          <span>✓</span>
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── Status Color-Block Header ── */}
      {isFinalized ? (
        <div className="bg-forest text-white rounded-card p-6 shadow-float space-y-4">
          <div className="flex items-center justify-between">
            <span className="pill pill-lime text-[10px] font-semibold">
              LOCKED IMMUTABLE SNAPSHOT
            </span>
            <span className="font-mono text-xs text-white/70">FINALIZED</span>
          </div>

          <div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-white tracking-tight">
              {version.paper_title || `Paper #${paperId}`}
            </h1>
            <p className="text-white/80 text-xs mt-1">
              Version {version.version_label} is locked and ready for deployment.
            </p>
          </div>

          <div className="pt-3 border-t border-white/20 flex flex-wrap items-center gap-3">
            {canAssignTest && (
              <Link
                to={`/papers/${paperId}/versions/${vId}/deliver`}
                id="deliver-version-link"
                className="px-5 py-3 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 active:scale-95 transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-2"
              >
                <span>Deliver Test</span>
                <span>→</span>
              </Link>
            )}

            <Link
              to={`/papers/${paperId}/versions/${vId}/print`}
              id="print-layout-link"
              className="px-4 py-3 rounded-pill bg-surface text-ink font-heading font-semibold text-xs hover:bg-bg transition-colors min-h-[44px] flex items-center justify-center gap-2"
            >
              <span>View Print Sheet</span>
              <span>↗</span>
            </Link>

            {canCreatePaper && (
              <button
                onClick={handleCloneSame}
                id="clone-version-btn"
                disabled={isFinalizing || isCloning}
                className={`px-4 py-3 rounded-pill text-xs font-heading font-medium min-h-[44px] cursor-pointer flex items-center justify-center gap-2 border transition-all ${
                  isCloning
                    ? 'bg-[#06241b] text-white border-forest shadow-inner'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20 disabled:opacity-50'
                }`}
              >
                {isCloning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-lime" />
                    <span>Cloning...</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-white/70" />
                    <span>Clone as Alternate Shift</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-surface border-2 border-ember/40 rounded-card p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <span className="pill pill-ember text-[10px] font-semibold">
              DRAFT UNLOCKED
            </span>
            <span className="font-mono text-xs text-ink/50">DRAFT</span>
          </div>

          <div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
              {version.paper_title || `Paper #${paperId}`}
            </h1>
            <p className="text-ink/70 text-xs mt-1">
              Version {version.version_label} is in draft status. Review questions before finalizing.
            </p>
          </div>

          <div className="pt-3 border-t border-border flex flex-wrap items-center gap-3">
            {canCreatePaper && (
              <button
                onClick={handleFinalize}
                id="finalize-version-btn"
                disabled={isFinalizing || isCloning}
                className="px-6 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isFinalizing ? 'Finalizing...' : 'Finalize & Lock Version'}</span>
                <span>🔒</span>
              </button>
            )}

            {canCreatePaper && (
              <button
                onClick={handleCloneSame}
                id="clone-version-btn"
                disabled={isFinalizing || isCloning}
                className={`px-4 py-3 rounded-pill text-xs font-heading font-medium min-h-[44px] cursor-pointer flex items-center justify-center gap-2 border transition-all ${
                  isCloning
                    ? 'bg-[#06241b] text-white border-forest shadow-inner'
                    : 'border-border bg-bg text-ink disabled:opacity-50'
                }`}
              >
                {isCloning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-lime" />
                    <span>Cloning...</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-forest" />
                    <span>Clone as Alternate Shift</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 2-Column Bento Metrics Grid ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[10px] font-mono uppercase text-ink/50 mb-1">
            Total Examination Marks
          </div>
          <div className="font-heading font-bold text-2xl text-forest" id="version-total-marks">
            {version.total_marks}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[10px] font-mono uppercase text-ink/50 mb-1">
            Questions Snapshot
          </div>
          <div className="font-heading font-bold text-2xl text-ink" id="version-question-count">
            {questionCount}
          </div>
        </div>
      </div>

      {/* Questions Snapshot */}
      <div className="space-y-3">
        <h2 className="font-heading font-bold text-lg text-ink">
          Snapshot Questions
        </h2>

        {version.question_snapshot?.map((q, idx) => (
          <div
            key={q.question_id || idx}
            className="bg-surface border border-border rounded-card p-5 shadow-card space-y-2.5"
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-bg border border-border px-2 py-0.5 rounded-sm">
                  Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                </span>
                <span className="pill pill-muted text-[10px]">{q.question_type}</span>
                <span className="pill pill-muted text-[10px]">{q.difficulty}</span>
              </div>
              <span className="font-mono text-xs font-bold text-forest">
                {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
              </span>
            </div>

            <p className="font-body text-sm font-medium text-ink leading-relaxed">
              {q.question_text}
            </p>

            {q.options && Object.keys(q.options).length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1 pl-2">
                {Object.entries(q.options).map(([optKey, optVal]) => (
                  <div key={optKey} className="p-2 rounded-card border border-border/70 bg-bg text-xs flex items-baseline gap-1.5">
                    <span className="font-mono font-bold text-forest">({optKey})</span>
                    <span className="text-ink/80">{optVal}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
