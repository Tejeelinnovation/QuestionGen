import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { useAuth } from '../../auth/AuthContext';
import type { PaperVersion } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';

export const VersionDetailPage: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const navigate = useNavigate();
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
        err.response?.data?.detail || 'Failed to load paper version details from server.'
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
      setSuccessMessage(`Version ${updated.version_label} has been finalized and locked for delivery.`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        (typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data)) ||
        'Failed to finalize version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloneSame = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setActionLoading(true);
    try {
      const cloned = await papersApi.cloneVersion(paperId, vId, {});
      navigate(`/papers/${paperId}/versions/${cloned.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to clone version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PaperWorkflowNav currentStep="version" paperId={paperId} versionId={vId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60">
          Loading immutable version snapshot...
        </div>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="space-y-6">
        <PaperWorkflowNav currentStep="version" paperId={paperId} versionId={vId} />
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
    <div className="space-y-8">
      {/* Workflow Navigation */}
      <PaperWorkflowNav
        currentStep="version"
        paperId={paperId}
        paperTitle={version.paper_title}
        versionId={vId}
        versionLabel={version.version_label}
      />

      {/* Error & Success Banners */}
      {errorMessage && (
        <div
          id="version-error-banner"
          className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium flex items-start gap-2"
        >
          <span className="font-bold text-sm">!</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          id="version-success-banner"
          className="rounded-card border border-forest/30 bg-forest/10 text-forest p-4 text-xs font-semibold flex items-start gap-2"
        >
          <span className="font-bold text-sm">✓</span>
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── REQUIREMENT: STATUS (DRAFT / FINALIZED) FULL COLOR-BLOCK HEADER CHANGE ── */}
      {isFinalized ? (
        /* FINALIZED STATE: Deep Forest Green Hero Block */
        <div className="bg-forest text-white rounded-card p-7 sm:p-8 shadow-float space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-white/15 border border-white/20 text-xs font-semibold text-lime">
                <span className="w-2 h-2 rounded-full bg-lime" />
                LOCKED IMMUTABLE SNAPSHOT
              </div>
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-white tracking-tight">
                {version.paper_title || `Paper #${paperId}`}
              </h1>
              <p className="text-white/80 text-sm max-w-xl">
                Version <span className="font-bold text-lime">{version.version_label}</span> is finalized. Questions and marks are permanently locked for grading fidelity.
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-1 text-xs text-white/70 font-mono">
              <span>Created {new Date(version.created_at).toLocaleString()}</span>
              <span className="pill pill-lime text-[11px] font-semibold mt-1">FINALIZED</span>
            </div>
          </div>

          {/* Differentiated Actions Bar */}
          <div className="pt-4 border-t border-white/20 flex flex-wrap items-center justify-between gap-4">
            {/* Primary Committed Actions */}
            <div className="flex items-center gap-3">
              {canAssignTest && (
                <Link
                  to={`/papers/${paperId}/versions/${vId}/deliver`}
                  id="deliver-version-link"
                  className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-ember text-white hover:bg-ember/90 transition-all shadow-sm flex items-center gap-2"
                >
                  <span>Deliver Online / Print Test</span>
                  <span>→</span>
                </Link>
              )}

              <Link
                to={`/papers/${paperId}/versions/${vId}/print`}
                id="print-layout-link"
                className="px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-surface text-ink hover:bg-bg transition-colors flex items-center gap-2"
              >
                <span>View Print Sheet</span>
                <span>↗</span>
              </Link>
            </div>

            {/* Secondary Actions */}
            {canCreatePaper && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloneSame}
                  id="clone-version-btn"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-heading font-medium rounded-pill bg-white/10 hover:bg-white/20 text-white border border-white/25 transition-colors cursor-pointer disabled:opacity-50"
                  title="Clone this version creating Version B/C with the same question pool"
                >
                  {actionLoading ? 'Cloning...' : 'Clone as Alternate Shift Version'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* DRAFT STATE: Warm Surface with Ember Accent Header Block */
        <div className="bg-surface border-2 border-ember/40 rounded-card p-7 sm:p-8 shadow-card space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-ember/10 border border-ember/30 text-xs font-semibold text-ember">
                <span className="w-2 h-2 rounded-full bg-ember animate-pulse" />
                DRAFT IN PROGRESS • UNLOCKED
              </div>
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
                {version.paper_title || `Paper #${paperId}`}
              </h1>
              <p className="text-ink/70 text-sm max-w-xl">
                Version <span className="font-bold text-forest">{version.version_label}</span> is in draft status. Review the candidate questions below before committing to a finalized state.
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-1 text-xs text-ink/50 font-mono">
              <span>Created {new Date(version.created_at).toLocaleString()}</span>
              <span className="pill pill-ember text-[11px] font-semibold mt-1">DRAFT</span>
            </div>
          </div>

          {/* Differentiated Actions Bar */}
          <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
            {/* Primary Committed Finalize Action */}
            <div className="flex items-center gap-3">
              {canCreatePaper && (
                <button
                  onClick={handleFinalize}
                  id="finalize-version-btn"
                  disabled={actionLoading}
                  className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <span>{actionLoading ? 'Locking Snapshot...' : 'Finalize & Lock Version'}</span>
                  <span>🔒</span>
                </button>
              )}
            </div>

            {/* Secondary Actions */}
            {canCreatePaper && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloneSame}
                  id="clone-version-btn"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-heading font-medium rounded-pill border border-border bg-bg text-ink hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-50"
                  title="Clone this version creating Version B/C with the same question pool"
                >
                  {actionLoading ? 'Cloning...' : 'Clone as Alternate Shift Version'}
                </button>

                <Link
                  to={`/papers/${paperId}/configure`}
                  className="text-xs font-heading font-semibold text-forest hover:underline"
                >
                  Configure Fresh Questions →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── METRIC TILES BAR ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mb-1">
            Version Identifier
          </div>
          <div className="font-heading font-bold text-2xl text-ink">
            Version {version.version_label}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mb-1">
            Total Examination Marks
          </div>
          <div className="font-heading font-bold text-2xl text-forest" id="version-total-marks">
            {version.total_marks}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mb-1">
            Questions Included
          </div>
          <div className="font-heading font-bold text-2xl text-ink" id="version-question-count">
            {questionCount}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mb-1">
            Lifecycle Status
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`pill text-xs font-semibold ${
                isFinalized ? 'pill-forest' : 'pill-ember'
              }`}
            >
              {version.status}
            </span>
          </div>
        </div>
      </div>

      {/* ── IMMUTABLE QUESTION SNAPSHOT CARDS ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Frozen Question Snapshot
            </h2>
            <p className="text-xs text-ink/60">
              Exact questions and option distributions locked into this paper version
            </p>
          </div>
          <span className="font-mono text-xs text-ink/50">
            {questionCount} {questionCount === 1 ? 'Question' : 'Questions'}
          </span>
        </div>

        <div className="space-y-3">
          {version.question_snapshot?.map((q, idx) => (
            <div
              key={q.question_id || idx}
              className="bg-surface border border-border rounded-card p-5 shadow-card space-y-3"
            >
              <div className="flex items-center justify-between text-xs border-b border-border/70 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-bg border border-border px-2 py-0.5 rounded-sm">
                    Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>
                  <span
                    className={`pill text-[10px] ${
                      q.question_type === 'MCQ'
                        ? 'pill-forest'
                        : q.question_type === 'SHORT_ANSWER'
                        ? 'pill-ember'
                        : 'pill-grape'
                    }`}
                  >
                    {q.question_type}
                  </span>
                  <span className="pill pill-muted text-[10px]">{q.difficulty}</span>
                </div>

                <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-2.5 py-0.5 rounded-pill">
                  {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                </span>
              </div>

              <p className="font-body text-sm font-medium text-ink leading-relaxed">
                {q.question_text}
              </p>

              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pl-2">
                  {Object.entries(q.options).map(([optKey, optVal]) => (
                    <div
                      key={optKey}
                      className="p-2 rounded-card border border-border/70 bg-bg text-xs flex items-baseline gap-2"
                    >
                      <span className="font-mono font-bold text-forest">({optKey})</span>
                      <span className="text-ink/80">{optVal}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {(!version.question_snapshot || version.question_snapshot.length === 0) && (
            <div className="bg-surface border-2 border-dashed border-border rounded-card p-10 text-center text-xs text-ink/50">
              No questions snapshot recorded for this version.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
