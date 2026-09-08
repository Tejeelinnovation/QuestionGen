import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { useAuth } from '../../auth/AuthContext';
import type { Paper } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { PaperDetailPageTablet } from '../tablet/papers/PaperDetailPageTablet';
import { PaperDetailPageMobile } from '../mobile/papers/PaperDetailPageMobile';
import { getStaggerDelay, MOTION } from '../../lib/motion';

const PaperDetailPageDesktop: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const { hasCapability, dashboardPath } = useAuth();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaper = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await papersApi.getPaper(paperId);
        setPaper(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load question paper details.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId) {
      fetchPaper();
    }
  }, [paperId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PaperWorkflowNav currentStep="version" paperId={paperId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60">
          Loading paper blueprint and version archive...
        </div>
      </div>
    );
  }

  if (errorMessage || !paper) {
    return (
      <div className="space-y-6">
        <PaperWorkflowNav currentStep="version" paperId={paperId} />
        <div className="p-4 space-y-4">
          {errorMessage && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
              {errorMessage}
            </div>
          )}
          <Link
            to={dashboardPath}
            className="text-xs font-heading font-semibold text-forest hover:underline"
          >
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const canCreatePaper = hasCapability('CREATE_PAPER');
  const versions = paper.versions || [];

  return (
    <div className="space-y-8">
      {/* Workflow Navigation */}
      <PaperWorkflowNav
        currentStep="version"
        paperId={paperId}
        paperTitle={paper.title}
        chapterTitle={paper.chapter_title}
      />

      {/* Asymmetric 2-Column Layout (Ref 09: Blog Cards Stacked Rhythm) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Blueprint Metadata Card & Action (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-bg border border-border text-xs font-semibold text-forest">
                <span className="w-2 h-2 rounded-full bg-forest" />
                Paper Blueprint #{paper.id}
              </div>
              <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
                {paper.title}
              </h1>
              <div className="text-xs text-ink/70 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-forest" />
                <span>{paper.chapter_title || `Chapter #${paper.chapter}`}</span>
              </div>
            </div>

            {paper.instructions && (
              <div className="p-3.5 bg-bg rounded-card border border-border/80 text-xs text-ink/75 leading-relaxed">
                <span className="font-heading font-semibold block text-ink mb-1">
                  Examination Guidelines:
                </span>
                {paper.instructions}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-bg p-3 rounded-card border border-border/70">
                <div className="text-[10px] font-mono uppercase text-ink/50">
                  Total Versions
                </div>
                <div className="font-heading font-bold text-xl text-forest">
                  {versions.length}
                </div>
              </div>
              <div className="bg-bg p-3 rounded-card border border-border/70">
                <div className="text-[10px] font-mono uppercase text-ink/50">
                  Paper Status
                </div>
                <div className="font-heading font-bold text-base text-ink truncate">
                  {paper.status || 'ACTIVE'}
                </div>
              </div>
            </div>

            {canCreatePaper && (
              <div className="pt-2 border-t border-border">
                <Link
                  to={`/papers/${paperId}/configure`}
                  id="new-version-btn"
                  className="w-full py-2.5 px-4 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <span>+ Configure New Version</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Stacked Version Cards (Ref: 09_blog_cards.jpg - 8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <div>
              <h2 className="font-heading font-bold text-xl text-ink">
                Generated Version Blueprints
              </h2>
              <p className="text-xs text-ink/60">
                Distinct question sets, difficulty calibrations & examination shifts
              </p>
            </div>
            <span className="pill pill-forest text-xs">
              {versions.length} {versions.length === 1 ? 'Version' : 'Versions'}
            </span>
          </div>

          <div className="space-y-3">
            {versions.map((v, idx) => {
              const isFinal = v.status === 'FINALIZED';

              return (
                <div
                  key={v.id}
                  style={getStaggerDelay(idx)}
                  className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card hover:border-forest flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${MOTION.hoverLift.className} ${MOTION.touch.card.className}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-heading font-bold text-lg text-ink">
                        Version {v.version_label}
                      </span>
                      <span
                        className={`pill text-[10px] ${
                          isFinal ? 'pill-forest' : 'pill-ember'
                        }`}
                      >
                        {v.status}
                      </span>
                      <span className="font-mono text-[11px] text-ink/40">
                        #{v.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-ink/70 font-mono">
                      <div>
                        Total Marks: <span className="font-bold text-forest">{v.total_marks}</span>
                      </div>
                      <div>•</div>
                      <div>
                        Questions: <span className="font-bold text-ink">{v.question_count}</span>
                      </div>
                      <div>•</div>
                      <div className="text-ink/50">
                        {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {isFinal && (
                      <Link
                        to={`/papers/${paperId}/versions/${v.id}/deliver`}
                        className="px-3.5 py-1.5 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 transition-colors"
                      >
                        Deliver →
                      </Link>
                    )}

                    <Link
                      to={`/papers/${paperId}/versions/${v.id}`}
                      className="px-3.5 py-1.5 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors"
                    >
                      Open Version →
                    </Link>
                  </div>
                </div>
              );
            })}

            {versions.length === 0 && (
              <div className="bg-surface border-2 border-dashed border-border rounded-card p-10 text-center space-y-3">
                <span className="pill pill-forest text-xs">Awaiting First Version</span>
                <h3 className="font-heading font-bold text-lg text-ink">
                  No versions created yet for this paper
                </h3>
                <p className="text-xs text-ink/70 max-w-sm mx-auto">
                  Filter questions from the chapter question bank and freeze your first exam version.
                </p>
                <Link
                  to={`/papers/${paperId}/configure`}
                  className="inline-block mt-2 px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90"
                >
                  Configure Questions Now →
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export const PaperDetailPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <PaperDetailPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <PaperDetailPageTablet key="tablet" />;
  }
  return <PaperDetailPageDesktop key="desktop" />;
};

