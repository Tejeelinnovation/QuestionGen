import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Paper } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';

export const PaperDetailPageTablet: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const { hasCapability } = useAuth();

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
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="version" paperId={paperId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60 text-sm">
          Loading paper blueprint...
        </div>
      </div>
    );
  }

  if (errorMessage || !paper) {
    return (
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="version" paperId={paperId} />
        <div className="p-4 space-y-4">
          {errorMessage && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
              {errorMessage}
            </div>
          )}
          <Link
            to="/dashboard/teacher"
            className="text-xs font-heading font-semibold text-forest hover:underline"
          >
            ← Return to Teacher Studio
          </Link>
        </div>
      </div>
    );
  }

  const canCreatePaper = hasCapability('CREATE_PAPER');
  const versions = paper.versions || [];

  return (
    <div className="space-y-6 font-body pb-16">
      <PaperWorkflowNavTablet
        currentStep="version"
        paperId={paperId}
        paperTitle={paper.title}
        chapterTitle={paper.chapter_title}
      />

      {/* ── 2-Column Bento Reflow ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        
        {/* Column 1: Blueprint Overview Card */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
          <div className="space-y-1.5">
            <span className="pill pill-forest text-[10px]">
              Blueprint #{paper.id}
            </span>
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
              <span className="font-heading font-semibold text-ink block mb-1">
                Examination Guidelines:
              </span>
              {paper.instructions}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-bg p-3 rounded-card border border-border text-center">
              <div className="text-[10px] font-mono uppercase text-ink/50">Versions</div>
              <div className="font-heading font-bold text-xl text-forest">{versions.length}</div>
            </div>
            <div className="bg-bg p-3 rounded-card border border-border text-center">
              <div className="text-[10px] font-mono uppercase text-ink/50">Status</div>
              <div className="font-heading font-bold text-base text-ink">{paper.status || 'ACTIVE'}</div>
            </div>
          </div>

          {canCreatePaper && (
            <div className="pt-2">
              <Link
                to={`/papers/${paperId}/configure`}
                id="new-version-btn"
                className="w-full py-3 px-4 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[44px]"
              >
                <span>+ Configure New Version</span>
              </Link>
            </div>
          )}
        </div>

        {/* Column 2: Stacked Version Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="font-heading font-bold text-lg text-ink">
              Generated Versions
            </h2>
            <span className="pill pill-forest text-xs">
              {versions.length} {versions.length === 1 ? 'Version' : 'Versions'}
            </span>
          </div>

          <div className="space-y-3">
            {versions.map((v) => {
              const isFinal = v.status === 'FINALIZED';
              return (
                <div
                  key={v.id}
                  className="bg-surface border border-border rounded-card p-4 shadow-card active:scale-[0.99] transition-transform flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-base text-ink">
                        Version {v.version_label}
                      </span>
                      <span
                        className={`pill text-[10px] ${
                          isFinal ? 'pill-forest' : 'pill-ember'
                        }`}
                      >
                        {v.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-ink/60 font-mono">
                      <span>{v.total_marks} Marks</span>
                      <span>•</span>
                      <span>{v.question_count} Qs</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {isFinal && (
                      <Link
                        to={`/papers/${paperId}/versions/${v.id}/deliver`}
                        className="px-4 py-2 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 min-h-[40px] flex items-center"
                      >
                        Deliver →
                      </Link>
                    )}

                    <Link
                      to={`/papers/${paperId}/versions/${v.id}`}
                      className="px-4 py-2 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white min-h-[40px] flex items-center"
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              );
            })}

            {versions.length === 0 && (
              <div className="bg-surface border-2 border-dashed border-border rounded-card p-8 text-center space-y-2 text-xs text-ink/60">
                <p>No versions created yet for this paper blueprint.</p>
                <Link
                  to={`/papers/${paperId}/configure`}
                  className="inline-block mt-2 font-heading font-semibold text-forest underline"
                >
                  Configure first version now →
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
