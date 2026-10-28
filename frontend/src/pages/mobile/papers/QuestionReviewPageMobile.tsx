import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { QuestionPreview, Paper } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { useToast } from '../../../context/ToastContext';
import { extractApiErrorMessage } from '../../../utils/errorUtils';
import { ChevronUp, ChevronDown, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';
import { MathText } from '../../../components/ui/MathText';
import { QuestionReplaceModal } from '../../../components/papers/QuestionReplaceModal';
import { API_BASE_URL } from '../../../api/client';
import { Layers } from 'lucide-react';
import { organizeQuestionsIntoSections } from '../../../utils/paperSectionUtils';

const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const QuestionReviewPageMobile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<QuestionPreview[]>([]);
  const [constraints, setConstraints] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [replacingQuestion, setReplacingQuestion] = useState<{ question: QuestionPreview; index: number } | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>('all');

  useEffect(() => {
    const loadPaper = async () => {
      try {
        const pData = await papersApi.getPaper(paperId);
        setPaper(pData);
      } catch (err) {
        console.error('Failed to load paper context:', err);
      }
    };
    if (paperId) {
      loadPaper();
    }
  }, [paperId]);

  useEffect(() => {
    const extractQuestions = (val: any): QuestionPreview[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (Array.isArray(val.questions)) return val.questions;
      return [];
    };

    const state = location.state as {
      questions?: any;
      constraints?: Record<string, any>;
    } | null;

    if (state?.questions) {
      setQuestions(extractQuestions(state.questions));
      setConstraints(state.constraints || {});
      return;
    }

    const stored = sessionStorage.getItem(`paper_${paperId}_review`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.questions) {
          setQuestions(extractQuestions(parsed.questions));
          setConstraints(parsed.constraints || {});
          return;
        }
      } catch (err) {
        console.error('Failed to parse cached review questions:', err);
      }
    }
  }, [paperId, location.state]);

  const handleRemoveQuestion = (questionId: number) => {
    setQuestions((prev) => {
      const next = prev.filter((q) => q.id !== questionId);
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: next, constraints })
      );
      return next;
    });
  };

  const handleReplaceQuestion = (replacement: QuestionPreview, targetIndex?: number) => {
    setQuestions((prev) => {
      let next: QuestionPreview[];
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < prev.length) {
        next = [...prev];
        next[targetIndex] = replacement;
      } else {
        const idx = prev.findIndex((item) => item.id === replacingQuestion?.question.id);
        if (idx !== -1) {
          next = [...prev];
          next[idx] = replacement;
        } else {
          next = [...prev, replacement];
        }
      }
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: next, constraints })
      );
      return next;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: copy, constraints })
      );
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: copy, constraints })
      );
      return copy;
    });
  };

  const handleSaveVersion = async () => {
    if (questions.length === 0) {
      toast.warning('Please select at least one question before creating a version.');
      return;
    }

    setIsSaving(true);
    try {
      const updatedConstraints = {
        ...constraints,
        ...(constraints.total_marks !== undefined && constraints.total_marks !== null
          ? { total_marks: totalMarks }
          : {}),
      };

      const isPdfMode = paper?.specifications?.source_mode === 'pdf';
      const versionPayload = isPdfMode
        ? {
            questions_data: questions,
            constraints_used: updatedConstraints,
          }
        : {
            question_ids: questions.map((q) => q.id),
            constraints_used: updatedConstraints,
          };

      const newVersion = await papersApi.createVersion(paperId, versionPayload);

      toast.success(`Exam Version ${newVersion.version_label} created successfully!`);
      sessionStorage.removeItem(`paper_${paperId}_review`);
      navigate(`/papers/${paperId}/versions/${newVersion.id}`);
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to save paper version.'));
    } finally {
      setIsSaving(false);
    }
  };

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
  const sections = organizeQuestionsIntoSections(questions);
  const visibleSections = activeSectionId === 'all'
    ? sections
    : sections.filter((s) => s.id === activeSectionId);

  return (
    <div className="space-y-4 font-body">
      <PaperWorkflowNavMobile
        currentStep="review"
        paperId={paperId}
        paperTitle={paper?.title}
        backTo={`/papers/${paperId}/configure`}
      />

      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-surface border border-border text-[10px] font-semibold text-forest">
          <span className="w-1.5 h-1.5 rounded-full bg-forest" />
          Review Questions
        </div>
        <h1 className="font-heading font-bold text-xl text-ink">
          Review Candidate Questions
        </h1>
        <p className="text-xs text-ink/70">
          Verify questions, adjust order, or remove unwanted items before generating version.
        </p>
      </div>

      {constraints.total_marks !== undefined &&
        constraints.total_marks !== null &&
        Number(constraints.total_marks) !== totalMarks && (
          <div
            id="quota-sync-info"
            className="rounded-card border border-forest/30 bg-forest/5 text-forest p-2.5 text-xs font-medium"
          >
            Target was {constraints.total_marks} marks. Finalizing at {totalMarks} marks.
          </div>
        )}

      {/* Quick Stat Pill Row */}
      <div className="flex items-center justify-between p-3 rounded-card bg-surface border border-border shadow-xs">
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-xl text-forest">
            {questions.length}
          </span>
          <span className="text-xs font-heading font-semibold text-ink/80">
            Questions Chosen
          </span>
        </div>
        <span className="pill pill-ember text-xs">
          {totalMarks} Total Marks
        </span>
      </div>

      {/* ── Mobile Section Filter Strip ── */}
      {sections.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-heading font-semibold text-ink px-1">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-forest" />
              <span>Exam Sections</span>
            </span>
            <span className="text-ink/60 font-mono text-[10px]">
              {sections.length} Sections
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setActiveSectionId('all')}
              className={`px-3 py-1.5 rounded-pill text-[11px] font-heading font-semibold transition-all shrink-0 cursor-pointer ${
                activeSectionId === 'all'
                  ? 'bg-forest text-white'
                  : 'bg-surface text-ink/70 border border-border'
              }`}
            >
              All ({questions.length})
            </button>

            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSectionId(sec.id)}
                className={`px-3 py-1.5 rounded-pill text-[11px] font-heading font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  activeSectionId === sec.id
                    ? 'bg-forest text-white'
                    : 'bg-surface text-ink/70 border border-border'
                }`}
              >
                <span>Sec {sec.letter}</span>
                <span className="text-[9px] opacity-80">
                  ({sec.questionCount})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Single-Column Question Cards Grouped by Section */}
      <div className="space-y-5">
        {questions.length === 0 ? (
          <div
            id="mobile-empty-review-state"
            className="p-8 text-center text-xs text-ink/70 bg-surface border-2 border-dashed border-border rounded-card space-y-3"
          >
            <div className="text-3xl">📝</div>
            <h3 className="font-heading font-bold text-base text-ink">
              All candidate questions removed
            </h3>
            <p className="text-xs text-ink/65 leading-relaxed">
              No questions remain in the curated list. You can re-query the question bank with adjusted filters.
            </p>
            <Link
              to={`/papers/${paperId}/configure`}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-all shadow-sm min-h-[44px]"
            >
              <span>Reconfigure Questions</span>
              <span>→</span>
            </Link>
          </div>
        ) : (
          visibleSections.map((sec) => (
            <div key={sec.id} className="space-y-2.5">
              {/* Section Header Banner */}
              <div className="bg-surface border-l-4 border-forest rounded-card p-3 shadow-xs space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-forest text-white font-heading font-bold text-[10px] uppercase rounded-sm">
                      SEC {sec.letter}
                    </span>
                    <h2 className="font-heading font-bold text-xs text-ink">
                      {sec.formatSummary}
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono text-ink/70">
                    {sec.questionCount} Qs • {sec.marksPerQuestion}M ({sec.totalMarks}M)
                  </span>
                </div>
                {sec.guideline && (
                  <p className="text-[10px] text-ink/60 font-body italic">
                    {sec.guideline}
                  </p>
                )}
              </div>

              {/* Questions */}
              <div className="space-y-2.5">
                {sec.items.map((item) => {
                  const q = item.question;
                  const globalIdx = item.globalIndex;

                  return (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5"
                    >
                      {/* Top meta row */}
                      <div className="flex items-center justify-between gap-1 border-b border-border/50 pb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs bg-forest/10 text-forest px-2 py-0.5 rounded-sm border border-forest/20">
                            Q{item.displayNumber < 10 ? `0${item.displayNumber}` : item.displayNumber}
                          </span>
                          <span className="text-[10px] font-mono text-ink/50">
                            (Sec {sec.letter} • #{item.sectionIndex})
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="pill pill-forest text-[10px] py-0.5 px-2">
                            {q.marks || 1} mk{(Number(q.marks) || 1) === 1 ? '' : 's'}
                          </span>
                          <span className="pill pill-muted text-[10px] py-0.5 px-2">
                            {q.question_type}
                          </span>
                          {q.difficulty && (
                            <span className="pill pill-ember text-[10px] py-0.5 px-2">
                              {q.difficulty}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Question text with KaTeX LaTeX math support */}
                      <div className="text-xs sm:text-sm text-ink leading-relaxed font-body">
                        <MathText text={q.question_text || (q as any).prompt || ''} as="div" />
                      </div>

                      {/* Attached Diagram / Visual Figure */}
                      {q.diagram && q.diagram.image_url && (
                        <div className="p-2.5 bg-bg border border-border/80 rounded-card flex items-center gap-2.5">
                          <img
                            src={resolveImageUrl(q.diagram.image_url)}
                            alt={q.diagram.caption || 'Question Diagram'}
                            className="w-14 h-14 object-contain rounded bg-surface border border-border/60 p-1 flex-shrink-0"
                            onError={(e) => {
                              const currentSrc = (e.currentTarget as HTMLImageElement).src;
                              if (!currentSrc.includes(':8000') && q.diagram?.image_url?.startsWith('/')) {
                                (e.currentTarget as HTMLImageElement).src = `http://127.0.0.1:8000${q.diagram.image_url}`;
                              }
                            }}
                          />
                          <div className="text-xs space-y-0.5 overflow-hidden">
                            <span className="font-heading font-semibold text-ink block truncate text-[11px]">
                              {q.diagram.title || q.diagram.caption || 'Attached Diagram Figure'}
                            </span>
                            {q.diagram.caption && (
                              <span className="font-mono text-[9px] text-ink/60 block truncate">
                                {q.diagram.caption}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* MCQ Options */}
                      {q.options && Object.keys(q.options).length > 0 && (
                        <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                          {Object.entries(q.options).map(([optKey, optVal]) => (
                            <div key={optKey} className="p-2 rounded-card border border-border/70 bg-bg text-xs flex items-baseline gap-1.5">
                              <span className="font-mono font-bold text-forest">({optKey})</span>
                              <MathText text={optVal} as="span" className="text-ink/80 text-xs" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action controls row: Move Up, Move Down, Delete */}
                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(globalIdx)}
                            disabled={globalIdx === 0}
                            className="p-2 rounded-card border border-border bg-surface hover:bg-surface-muted active:scale-95 disabled:opacity-30 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            aria-label="Move Up"
                          >
                            <ChevronUp className="w-4 h-4 text-ink" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(globalIdx)}
                            disabled={globalIdx === questions.length - 1}
                            className="p-2 rounded-card border border-border bg-surface hover:bg-surface-muted active:scale-95 disabled:opacity-30 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            aria-label="Move Down"
                          >
                            <ChevronDown className="w-4 h-4 text-ink" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setReplacingQuestion({ question: q, index: globalIdx })}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 text-[11px] font-heading font-semibold text-forest hover:bg-forest/10 p-2 rounded-card active:scale-95 transition-colors cursor-pointer min-h-[36px]"
                            title="Replace question"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Replace</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(q.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-heading font-semibold text-ember hover:bg-ember/10 p-2 rounded-card active:scale-95 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Save Version Action Button */}
      <button
        type="button"
        id="mobile-save-version-btn"
        onClick={handleSaveVersion}
        disabled={isSaving || questions.length === 0}
        className="w-full py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-50"
      >
        {isSaving ? (
          'Saving Version...'
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 text-lime" />
            <span>Lock & Create Version →</span>
          </>
        )}
      </button>

      {/* Question Replace Modal */}
      <QuestionReplaceModal
        isOpen={Boolean(replacingQuestion)}
        onClose={() => setReplacingQuestion(null)}
        targetQuestion={replacingQuestion?.question || null}
        targetIndex={replacingQuestion?.index}
        existingQuestionIds={questions.map((q) => q.id)}
        onSelectReplacement={handleReplaceQuestion}
      />
    </div>
  );
};
