import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Paper } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { FilePlus, ChevronRight } from 'lucide-react';

export const PaperDetailPageMobile: React.FC = () => {
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
      <div className="py-12 text-center text-xs text-ink/60 font-body">
        Loading paper overview...
      </div>
    );
  }

  if (errorMessage || !paper) {
    return (
      <div className="space-y-4 font-body">
        <PaperWorkflowNavMobile currentStep="version" paperId={paperId} backTo="/dashboard/teacher" />
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage || 'Paper not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body">
      <PaperWorkflowNavMobile
        currentStep="version"
        paperId={paperId}
        paperTitle={paper.title}
        backTo="/dashboard/teacher"
      />

      {/* Overview Card */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h1 className="font-heading font-bold text-lg text-ink">
              {paper.title}
            </h1>
            <div className="text-xs text-ink/60 font-mono">
              Chapter: {paper.chapter_title || `#${paper.chapter}`}
            </div>
          </div>
          <span
            className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
              paper.status === 'FINALIZED' ? 'pill-forest' : 'pill-muted'
            }`}
          >
            {paper.status || 'Draft'}
          </span>
        </div>

        {paper.instructions && (
          <div className="pt-2 border-t border-border/50 text-xs text-ink/75 leading-relaxed">
            <span className="font-heading font-semibold text-ink block mb-0.5">Instructions:</span>
            {paper.instructions}
          </div>
        )}
      </div>

      {/* Action: Configure New Version */}
      {hasCapability('CREATE_PAPER') && (
        <Link
          to={`/papers/${paperId}/configure`}
          className="w-full py-3 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
        >
          <FilePlus className="w-4 h-4" />
          <span>Configure New Version</span>
        </Link>
      )}

      {/* Versions List Feed */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>GENERATED VERSIONS ({paper.versions?.length || 0})</span>
        </div>

        {(!paper.versions || paper.versions.length === 0) ? (
          <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card space-y-2">
            <p>No versions generated for this paper yet.</p>
            <Link
              to={`/papers/${paperId}/configure`}
              className="text-xs font-heading font-semibold text-forest hover:underline"
            >
              Generate Version 1 →
            </Link>
          </div>
        ) : (
          paper.versions.map((v) => {
            const isFinal = v.status === 'FINALIZED';
            return (
              <Link
                key={v.id}
                to={`/papers/${paperId}/versions/${v.id}`}
                className="block p-3.5 rounded-card bg-surface border border-border shadow-xs hover:border-forest/40 active:scale-[0.99] transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-sm text-ink">
                      Version {v.version_label}
                    </span>
                    <span
                      className={`pill text-[10px] py-0.5 px-2 ${
                        isFinal ? 'pill-forest' : 'pill-muted'
                      }`}
                    >
                      {isFinal ? 'Locked' : 'Draft'}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink/40" />
                </div>

                <div className="flex items-center justify-between text-[11px] text-ink/60 font-mono pt-1 border-t border-border/40">
                  <span>{v.question_count || 0} Questions</span>
                  <span>{v.total_marks || 0} Marks</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
};
