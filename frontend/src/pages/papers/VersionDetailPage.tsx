import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PaperVersion } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { VersionDetailPageTablet } from '../tablet/papers/VersionDetailPageTablet';
import { VersionDetailPageMobile } from '../mobile/papers/VersionDetailPageMobile';
import { SkeletonPaperDetail } from '../../components/ui/skeleton';
import { Loader2, Copy } from 'lucide-react';
import { API_BASE_URL } from '../../api/client';
import { MathText } from '../../components/ui/MathText';

const VersionDetailPageDesktop: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const toast = useToast();

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

const groupedSections = React.useMemo(() => {
    const raw = version?.question_snapshot || [];
    if (!raw.length) return [];

    const mcq: typeof raw = [];
    const vsa: typeof raw = [];
    const sa: typeof raw = [];
    const la: typeof raw = [];

    raw.forEach((q) => {
      const marks = Number(q.marks || 1);
      const qType = String(q.question_type || '').toUpperCase();
      if (qType === 'MCQ' || (marks <= 1 && q.options && Object.keys(q.options).length > 0)) {
        mcq.push(q);
      } else if (marks <= 2 && qType !== 'LONG_ANSWER') {
        vsa.push(q);
      } else if (marks <= 3.5 && qType !== 'LONG_ANSWER') {
        sa.push(q);
      } else {
        la.push(q);
      }
    });

    const secCodes = ['A', 'B', 'C', 'D'];
    let codeIdx = 0;
    let runningQNum = 1;
    const result: Array<{
      code: string;
      title: string;
      instructions: string;
      totalMarks: number;
      questions: Array<(typeof raw)[number] & { displayNum: number }>;
    }> = [];

    const addSection = (baseTitle: string, baseInst: string, items: typeof raw) => {
      if (!items.length) return;
      const code = secCodes[codeIdx++];
      const totalMarks = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);
      const itemsWithNum = items.map((item) => ({
        ...item,
        displayNum: runningQNum++,
      }));

      const distinctMarks = Array.from(new Set(items.map((i) => Number(i.marks || 1))));
      let titleWithMarks = baseTitle;
      let inst = baseInst;

      if (distinctMarks.length === 1) {
        const m = distinctMarks[0];
        const markLabel = m === 1 ? '1 Mark' : `${m} Marks`;
        titleWithMarks = `${baseTitle} (${markLabel} Each)`;
        inst = `Questions carry ${markLabel.toLowerCase()} each. ${baseInst}`;
      } else {
        inst = `Marks for each question are indicated against it. ${baseInst}`;
      }

      result.push({
        code,
        title: `Section ${code} — ${titleWithMarks}`,
        instructions: inst,
        totalMarks: Math.round(totalMarks * 10) / 10,
        questions: itemsWithNum,
      });
    };

    addSection('Multiple Choice Questions', 'Select the single best option.', mcq);
    addSection('Very Short Answer Questions', 'Answer concisely in 30–50 words with balanced equations or formulas where applicable.', vsa);
    addSection('Short Answer Questions', 'Answer in 50–80 words with step-by-step working and units.', sa);
    addSection('Long Answer & Analytical Questions', 'Provide detailed explanations, complete derivations, or diagrams.', la);

    if (result.length <= 1) {
      return [{
        code: 'A',
        title: 'All Examination Questions',
        instructions: 'Read all questions carefully before attempting.',
        totalMarks: raw.reduce((sum, item) => sum + Number(item.marks || 0), 0),
        questions: raw.map((item, idx) => ({ ...item, displayNum: idx + 1 })),
      }];
    }

    return result;
  }, [version?.question_snapshot]);


  const handleFinalize = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFinalizing(true);
    try {
      const updated = await papersApi.finalizeVersion(paperId, vId);
      setVersion(updated);
      const msg = `Version ${updated.version_label} has been finalized and locked for delivery.`;
      setSuccessMessage(msg);
      toast.success(msg);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        (typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data)) ||
        'Failed to finalize version.';
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      setErrorMessage(msg);
      toast.error(msg);
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
      toast.success(`Created clone Version ${cloned.version_label}.`);
      setIsCloning(false);
      navigate(`/papers/${paperId}/versions/${cloned.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to clone version.';
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      setErrorMessage(msg);
      toast.error(msg);
      setIsCloning(false);
    }
  };

  if (isLoading) {
    return <SkeletonPaperDetail />;
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


  const resolveImgUrl = (url?: string): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

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
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-white tracking-tight break-words [overflow-wrap:anywhere]">
                {(version.paper_title || `Paper #${paperId}`).replace(/_/g, ' ')}
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
                  disabled={isFinalizing || isCloning}
                  className={`px-4 py-2 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer flex items-center gap-2 ${
                    isCloning
                      ? 'bg-[#06241b] text-white border-forest shadow-inner'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/25 disabled:opacity-50'
                  }`}
                  title="Clone this version creating Version B/C with the same question pool"
                >
                  {isCloning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-lime" />
                      <span>Cloning...</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white/70" />
                      <span>Clone as Alternate Shift Version</span>
                    </>
                  )}
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
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight break-words [overflow-wrap:anywhere]">
                {(version.paper_title || `Paper #${paperId}`).replace(/_/g, ' ')}
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
                  disabled={isFinalizing || isCloning}
                  className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <span>{isFinalizing ? 'Locking Snapshot...' : 'Finalize & Lock Version'}</span>
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
                  disabled={isFinalizing || isCloning}
                  className={`px-4 py-2 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer flex items-center gap-2 ${
                    isCloning
                      ? 'bg-[#06241b] text-white border-forest shadow-inner'
                      : 'border-border bg-bg text-ink hover:bg-surface-muted disabled:opacity-50'
                  }`}
                  title="Clone this version creating Version B/C with the same question pool"
                >
                  {isCloning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-lime" />
                      <span>Cloning...</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-forest" />
                      <span>Clone as Alternate Shift Version</span>
                    </>
                  )}
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

        <div className="space-y-6">
          {groupedSections.map((sec) => (
            <div key={sec.code} className="space-y-3">
              {/* Section Header Banner */}
              <div className="border border-border/90 bg-surface-muted/60 rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                <div>
                  <h3 className="font-heading font-bold text-base text-ink tracking-tight">
                    {sec.title}
                  </h3>
                  {sec.instructions && (
                    <p className="text-xs text-ink/70 italic mt-0.5 font-serif">
                      {sec.instructions}
                    </p>
                  )}
                </div>
                <div className="text-xs font-mono font-bold text-forest bg-forest/10 border border-forest/20 px-3 py-1 rounded-pill shrink-0">
                  {sec.questions.length} {sec.questions.length === 1 ? 'Question' : 'Questions'} • {sec.totalMarks} Marks
                </div>
              </div>

              {/* Questions within this section */}
              <div className="space-y-3 pl-0 sm:pl-2">
                {sec.questions.map((q, qIdx) => (
                  <div
                    key={q.question_id || qIdx}
                    className="bg-surface border border-border rounded-card p-5 shadow-card space-y-3 hover:border-forest/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs border-b border-border/70 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-bg border border-border px-2 py-0.5 rounded-sm">
                          Q{(q.displayNum || (qIdx + 1)) < 10 ? `0${q.displayNum || (qIdx + 1)}` : (q.displayNum || (qIdx + 1))}
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

                    <div className="font-body text-sm font-medium text-ink leading-relaxed">
                      <MathText text={q.question_text} as="p" />
                    </div>

                    {/* Diagram Display if attached */}
                    {q.diagram && q.diagram.image_url && (
                      <div className="py-2.5 flex flex-col items-center justify-center bg-bg/50 border border-border/60 rounded-card p-2">
                        <img
                          src={resolveImgUrl(q.diagram.image_url)}
                          alt={q.diagram.title || 'Question Diagram'}
                          className="max-h-56 max-w-sm object-contain border border-border rounded"
                          onError={(e) => {
                            const cur = (e.currentTarget as HTMLImageElement).src;
                            if (!cur.includes(':8000') && q.diagram?.image_url?.startsWith('/')) {
                              (e.currentTarget as HTMLImageElement).src = `http://127.0.0.1:8000${q.diagram.image_url}`;
                            }
                          }}
                        />
                        {q.diagram.title && (
                          <span className="text-[11px] font-mono text-ink/60 mt-1 italic">
                            {q.diagram.title}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Options for MCQ */}
                    {q.options && Object.keys(q.options).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pl-2">
                        {Object.entries(q.options).map(([optKey, optVal]) => (
                          <div
                            key={optKey}
                            className="p-2 rounded-card border border-border/70 bg-bg text-xs flex items-baseline gap-2"
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

export const VersionDetailPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <VersionDetailPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <VersionDetailPageTablet key="tablet" />;
  }
  return <VersionDetailPageDesktop key="desktop" />;
};

