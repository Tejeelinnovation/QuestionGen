import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { QuestionPreview, Paper } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { ChevronUp, ChevronDown, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';
import { QuestionReplaceModal } from '../../../components/papers/QuestionReplaceModal';

export const QuestionReviewPageMobile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<QuestionPreview[]>([]);
  const [constraints, setConstraints] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replacingQuestion, setReplacingQuestion] = useState<{ question: QuestionPreview; index: number } | null>(null);

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
      setErrorMessage('Please select at least one question before creating a version.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updatedConstraints = {
        ...constraints,
        ...(constraints.total_marks !== undefined && constraints.total_marks !== null
          ? { total_marks: totalMarks }
          : {}),
      };

      const newVersion = await papersApi.createVersion(paperId, {
        question_ids: questions.map((q) => q.id),
        constraints_used: updatedConstraints,
      });

      sessionStorage.removeItem(`paper_${paperId}_review`);
      navigate(`/papers/${paperId}/versions/${newVersion.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to save paper version.';
      setErrorMessage(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

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

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

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

      {/* Single-Column Question Cards */}
      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No questions in list. Go back to configuration to generate questions.
          </div>
        ) : (
          questions.map((q, idx) => (
            <div
              key={q.id}
              className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5"
            >
              {/* Top meta row */}
              <div className="flex items-center justify-between gap-1 border-b border-border/50 pb-2">
                <span className="font-mono font-bold text-xs text-forest">
                  #{idx + 1}
                </span>

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

              {/* Question text */}
              <p className="text-xs sm:text-sm text-ink leading-relaxed font-body">
                {q.question_text || (q as any).prompt}
              </p>

              {/* Action controls row: Move Up, Move Down, Delete */}
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    className="p-2 rounded-card border border-border bg-surface hover:bg-surface-muted active:scale-95 disabled:opacity-30 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    aria-label="Move Up"
                  >
                    <ChevronUp className="w-4 h-4 text-ink" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === questions.length - 1}
                    className="p-2 rounded-card border border-border bg-surface hover:bg-surface-muted active:scale-95 disabled:opacity-30 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    aria-label="Move Down"
                  >
                    <ChevronDown className="w-4 h-4 text-ink" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setReplacingQuestion({ question: q, index: idx })}
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
