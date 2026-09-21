import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import type { Paper, PaperVersion } from '../../types';
import {
  FilePlus,
  BookOpen,
  Clock,
  Award,
  Layers,
  X,
  ChevronRight,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface AssignPaperModalProps {
  targetClass: {
    id: number;
    name: string;
    subject?: string;
  };
  onClose: () => void;
}

interface EligiblePaperItem {
  paper: Paper;
  version: PaperVersion;
}

export const AssignPaperModal: React.FC<AssignPaperModalProps> = ({ targetClass, onClose }) => {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [eligiblePapers, setEligiblePapers] = useState<EligiblePaperItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<EligiblePaperItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadEligiblePapers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [allPapers, allDeliveries] = await Promise.all([
          papersApi.getPapers(),
          papersApi.getDeliveries(),
        ]);

        // Find finalized versions not yet delivered to this target class
        const eligible: EligiblePaperItem[] = [];

        await Promise.all(
          allPapers.map(async (paper) => {
            try {
              const versions = await papersApi.getPaperVersions(paper.id);
              for (const version of versions) {
                if (version.status === 'FINALIZED') {
                  const alreadyDelivered = allDeliveries.some((d: any) => {
                    const classIdMatches =
                      d.target_class === targetClass.id ||
                      d.target_class_id === targetClass.id ||
                      (typeof d.target_class === 'object' && d.target_class?.id === targetClass.id);

                    const versionMatches =
                      d.paper_version === version.id ||
                      d.paper_version_id === version.id ||
                      (typeof d.paper_version === 'object' && d.paper_version?.id === version.id);

                    return Boolean(classIdMatches && versionMatches);
                  });

                  if (!alreadyDelivered) {
                    eligible.push({ paper, version });
                  }
                }
              }
            } catch (vErr) {
              console.warn(`Failed to fetch versions for paper ${paper.id}:`, vErr);
            }
          })
        );

        if (isMounted) {
          setEligiblePapers(eligible);
          if (eligible.length > 0) {
            setSelectedItem(eligible[0]);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load eligible papers:', err);
          setError(err.response?.data?.detail || 'Failed to load papers archive.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadEligiblePapers();

    return () => {
      isMounted = false;
    };
  }, [targetClass.id]);

  const handleStartNewPaper = () => {
    onClose();
    const query = new URLSearchParams();
    query.set('class_id', String(targetClass.id));
    if (targetClass.subject) {
      query.set('subject', targetClass.subject);
    }
    navigate(`/papers/new?${query.toString()}`);
  };

  const handleDeliverExisting = () => {
    if (!selectedItem) return;
    onClose();
    const { paper, version } = selectedItem;
    navigate(`/papers/${paper.id}/versions/${version.id}/deliver?class_id=${targetClass.id}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-card shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-surface-muted/40">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="pill pill-forest text-xs font-semibold">Assign Assessment</span>
              {targetClass.subject && (
                <span className="pill pill-grape text-xs">{targetClass.subject}</span>
              )}
            </div>
            <h3 className="font-heading font-bold text-xl text-ink">
              Assign Paper to {targetClass.name}
            </h3>
            <p className="text-xs text-ink/70">
              Create a new tailored exam blueprint or select an existing finalized paper from your archive.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-border/60 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* ── Choice 1: Create New Paper ── */}
          <div className="p-4 rounded-card border-2 border-forest/30 bg-forest/5 hover:border-forest/60 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-forest font-heading font-bold text-sm">
                <Sparkles className="w-4 h-4 text-forest shrink-0" />
                <span>Option 1: Create New Paper</span>
              </div>
              <p className="text-xs text-ink/70 max-w-md">
                Configure syllabus chapters, difficulty tiers, question counts, and generate a brand-new customized exam.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartNewPaper}
              className="px-4 py-2.5 rounded-pill bg-forest text-white hover:bg-forest/90 font-heading font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
            >
              <FilePlus className="w-3.5 h-3.5" />
              <span>Create New Paper →</span>
            </button>
          </div>

          {/* ── Choice 2: Select Existing Finalized Paper ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink font-heading font-bold text-sm">
                <Layers className="w-4 h-4 text-grape shrink-0" />
                <span>Option 2: Assign Existing Finalized Paper</span>
              </div>
              <span className="text-[11px] font-mono text-ink/60">
                {eligiblePapers.length} Available in Archive
              </span>
            </div>
            <p className="text-xs text-ink/60">
              Directly assign a previously finalized paper version that has not yet been delivered to {targetClass.name}.
            </p>

            {isLoading ? (
              <div className="space-y-2 py-4">
                <div className="h-16 rounded-card bg-surface-muted/60 animate-pulse border border-border" />
                <div className="h-16 rounded-card bg-surface-muted/60 animate-pulse border border-border" />
              </div>
            ) : error ? (
              <div className="p-4 rounded-card bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{error}</span>
              </div>
            ) : eligiblePapers.length === 0 ? (
              <div className="p-6 text-center rounded-card bg-surface border border-dashed border-border space-y-2">
                <BookOpen className="w-8 h-8 text-ink/30 mx-auto" />
                <p className="text-xs font-semibold text-ink">No Unassigned Finalized Papers</p>
                <p className="text-[11px] text-ink/60 max-w-sm mx-auto">
                  All finalized papers in your archive have already been delivered to this class, or you haven't finalized any papers yet.
                </p>
                <button
                  type="button"
                  onClick={handleStartNewPaper}
                  className="mt-2 px-3 py-1.5 rounded-pill bg-surface-muted border border-border text-xs font-heading font-semibold hover:border-forest hover:text-forest transition-colors"
                >
                  Create New Paper Instead
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {eligiblePapers.map(({ paper, version }) => {
                  const isSelected =
                    selectedItem?.paper.id === paper.id && selectedItem?.version.id === version.id;

                  return (
                    <div
                      key={`${paper.id}-${version.id}`}
                      onClick={() => setSelectedItem({ paper, version })}
                      className={`p-3.5 rounded-card border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-forest bg-forest/5 shadow-sm'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-forest bg-forest text-white' : 'border-border'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-bold text-xs text-ink truncate">
                              {paper.title}
                            </span>
                            <span className="pill pill-forest text-[10px] font-mono">
                              Ver {version.version_label}
                            </span>
                            {paper.chapter_title && (
                              <span className="text-[10px] text-ink/60 truncate max-w-[120px]">
                                • {paper.chapter_title}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-ink/60 font-mono">
                            <span className="flex items-center gap-1">
                              <Award className="w-3 h-3 text-ember" />
                              {version.total_marks} Marks
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-ink/50" />
                              {paper.duration_minutes || 60}m
                            </span>
                            <span>•</span>
                            <span>{version.question_snapshot?.length || 0} Questions</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-xs font-semibold text-forest flex items-center gap-0.5">
                        <span>Select</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-surface-muted/30 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-surface border border-border text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {eligiblePapers.length > 0 && (
            <button
              type="button"
              onClick={handleDeliverExisting}
              disabled={!selectedItem}
              className="px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Proceed to Delivery Setup</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
