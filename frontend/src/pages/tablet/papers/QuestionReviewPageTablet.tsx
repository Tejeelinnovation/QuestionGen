import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { QuestionPreview, Paper } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';

export const QuestionReviewPageTablet: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<QuestionPreview[]>([]);
  const [constraints, setConstraints] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
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
      return copy;
    });
  };

  const runningTotalMarks = questions.reduce(
    (sum, q) => sum + (parseFloat(String(q.marks)) || 0),
    0
  );

  const handleSaveAsVersion = async () => {
    setErrorMessage(null);
    setIsSaving(true);
    try {
      const updatedConstraints = {
        ...constraints,
        ...(constraints.total_marks !== undefined && constraints.total_marks !== null
          ? { total_marks: runningTotalMarks }
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
        err.response?.data?.question_ids?.[0] ||
        err.response?.data?.question_ids ||
        err.response?.data?.total_marks?.[0] ||
        err.response?.data?.total_marks ||
        err.response?.data?.detail ||
        (typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data)) ||
        'Failed to save questions as a new version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-body pb-16">
      <PaperWorkflowNavTablet
        currentStep="review"
        paperId={paperId}
        paperTitle={paper?.title}
        chapterTitle={paper?.chapter_title}
      />

      {/* Header section */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest">
            <span className="w-1.5 h-1.5 rounded-full bg-forest" />
            Stage 03 • Curation
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
            Review Candidate Pool
          </h1>
          <p className="text-ink/70 text-xs max-w-xl">
            Reorder presentation order, remove questions, and lock into an immutable version snapshot.
          </p>
        </div>

        <Link
          to={`/papers/${paperId}/configure`}
          className="px-4 py-2 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-surface-muted min-h-[44px] flex items-center shrink-0"
        >
          ← Filters
        </Link>
      </div>

      {errorMessage && (
        <div
          id="review-error-banner"
          className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium"
        >
          {errorMessage}
        </div>
      )}

      {constraints.total_marks !== undefined &&
        constraints.total_marks !== null &&
        Number(constraints.total_marks) !== runningTotalMarks && (
          <div
            id="quota-sync-info"
            className="rounded-card border border-forest/30 bg-forest/5 text-forest p-3 text-xs font-medium"
          >
            Target was <strong>{constraints.total_marks} marks</strong>. Curated selection totals{' '}
            <strong>{runningTotalMarks} marks</strong> (will finalize at {runningTotalMarks} marks).
          </div>
        )}

      {/* ── Running Total Metrics Banner ── */}
      <div className="bg-surface border border-border rounded-card p-5 shadow-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50">
              Total Marks
            </div>
            <div className="font-heading font-bold text-3xl text-forest">
              {runningTotalMarks % 1 === 0 ? runningTotalMarks : runningTotalMarks.toFixed(1)}
            </div>
          </div>
          <div className="border-l border-border pl-8">
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50">
              Questions
            </div>
            <div className="font-heading font-bold text-3xl text-ink">
              {questions.length}
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveAsVersion}
          id="save-version-btn"
          disabled={isSaving || questions.length === 0}
          className="px-6 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center gap-2"
        >
          <span>{isSaving ? 'Saving...' : 'Save as Formal Version'}</span>
          <span>→</span>
        </button>
      </div>

      {/* ── Question Cards with Enlarged Touch Controls ── */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="bg-surface border border-border rounded-card p-5 sm:p-6 shadow-card space-y-3"
          >
            {/* Sequence & Controls Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-bg border border-border px-2.5 py-1 rounded-sm">
                  #{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                </span>
                <span className="pill pill-forest text-[10px]">
                  {q.question_type}
                </span>
                <span className="pill pill-muted text-[10px]">
                  {q.difficulty}
                </span>
                <span className="font-mono text-xs font-bold text-forest ml-2">
                  [{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]
                </span>
              </div>

              {/* Touch Reorder & Remove Controls (min-h-[40px]) */}
              <div className="flex items-center gap-1.5 bg-bg p-1 rounded-pill border border-border">
                <button
                  type="button"
                  onClick={() => handleMoveUp(idx)}
                  disabled={idx === 0 || isSaving}
                  className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill hover:bg-surface disabled:opacity-30 cursor-pointer min-h-[36px] flex items-center"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(idx)}
                  disabled={idx === questions.length - 1 || isSaving}
                  className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill hover:bg-surface disabled:opacity-30 cursor-pointer min-h-[36px] flex items-center"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveQuestion(q.id)}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill text-ember hover:bg-ember/10 cursor-pointer min-h-[36px] flex items-center"
                >
                  Remove
                </button>
              </div>
            </div>

            <p className="font-body text-sm font-medium text-ink leading-relaxed">
              {q.question_text}
            </p>

            {q.options && Object.keys(q.options).length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {Object.entries(q.options).map(([optKey, optVal]) => (
                  <div key={optKey} className="p-2.5 rounded-card border border-border/80 bg-bg text-xs flex items-baseline gap-2">
                    <span className="font-mono font-bold text-forest">({optKey})</span>
                    <span className="text-ink/80">{optVal}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {questions.length === 0 && (
          <div className="bg-surface border-2 border-dashed border-border rounded-card p-10 text-center space-y-3">
            <h3 className="font-heading font-bold text-lg text-ink">No questions remaining</h3>
            <Link
              to={`/papers/${paperId}/configure`}
              className="inline-block px-5 py-2.5 rounded-pill bg-forest text-white text-xs font-heading font-semibold"
            >
              Reconfigure Questions →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
