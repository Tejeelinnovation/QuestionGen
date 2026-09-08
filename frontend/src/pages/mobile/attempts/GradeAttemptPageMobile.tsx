import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import { useAuth } from '../../../auth/AuthContext';
import type { TeacherAttemptDetail } from '../../../types';
import { ArrowLeft, CheckCircle2, Save, Check, X } from 'lucide-react';

interface GradeFormState {
  marks: string;
  isCorrect: boolean;
  feedback: string;
  isSaving: boolean;
  isSaved: boolean;
  error: string | null;
}

export const GradeAttemptPageMobile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const attemptId = Number(id);
  const { dashboardPath } = useAuth();

  const [attempt, setAttempt] = useState<TeacherAttemptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [gradingState, setGradingState] = useState<Record<number, GradeFormState>>({});

  const fetchAttempt = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await attemptsApi.getTeacherAttemptDetail(attemptId);
      setAttempt(data);

      const initialMap: Record<number, GradeFormState> = {};
      data.answers.forEach((ans) => {
        const isGraded = ans.marks_awarded !== null;
        initialMap[ans.question_id] = {
          marks: ans.marks_awarded !== null ? String(ans.marks_awarded) : '0',
          isCorrect: ans.is_correct ?? false,
          feedback: '',
          isSaving: false,
          isSaved: isGraded,
          error: null,
        };
      });
      setGradingState(initialMap);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load attempt details for grading.'
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (attemptId) {
      fetchAttempt(true);
    }
  }, [attemptId]);

  const handleFieldChange = (
    questionId: number,
    field: 'marks' | 'isCorrect' | 'feedback',
    val: any
  ) => {
    setGradingState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: val,
        isSaved: false,
      },
    }));
  };

  const handleSaveQuestionGrade = async (questionId: number, maxMarks: number) => {
    const state = gradingState[questionId];
    if (!state) return;

    const numMarks = parseFloat(state.marks);
    if (isNaN(numMarks) || numMarks < 0 || numMarks > maxMarks) {
      setGradingState((prev) => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          error: `Marks must be between 0 and ${maxMarks}`,
        },
      }));
      return;
    }

    setGradingState((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], isSaving: true, error: null },
    }));

    try {
      await attemptsApi.gradeAnswer(attemptId, questionId, {
        marks_awarded: numMarks,
        is_correct: state.isCorrect,
      });

      setGradingState((prev) => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          isSaving: false,
          isSaved: true,
          error: null,
        },
      }));
      setSuccessBanner(`Saved grade for Question #${questionId}`);
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to save question grade.';
      setGradingState((prev) => ({
        ...prev,
        [questionId]: { ...prev[questionId], isSaving: false, error: detail },
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center text-xs text-ink/60 font-body">
        Loading student attempt for grading...
      </div>
    );
  }

  if (errorMessage || !attempt) {
    return (
      <div className="space-y-4 font-body py-6">
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage || 'Attempt not found.'}
        </div>
        <Link
          to={dashboardPath}
          className="w-full py-3 px-4 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold flex items-center justify-center"
        >
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body">
      {/* Top Navigation */}
      <Link
        to={`/deliveries/${attempt.delivery}/results`}
        className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-forest hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Results Roster</span>
      </Link>

      {/* ── Headline Attempt Overview Card ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <span className="pill pill-forest text-[10px] py-0.5 px-2">
              Grading Portal
            </span>
            <h1 className="font-heading font-bold text-lg text-ink">
              {attempt.student_username}'s Attempt
            </h1>
            <div className="text-xs text-ink/60 font-mono">
              @{attempt.student_username} • {attempt.paper_title}
            </div>
          </div>

          <span
            className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
              attempt.status === 'EVALUATED' ? 'pill-forest' : 'pill-ember'
            }`}
          >
            {attempt.status}
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-2 border-t border-border/50 text-xs">
          <span className="text-ink/60 font-mono">
            {attempt.answers.length} Questions to Grade
          </span>
          <span className="font-heading font-bold text-sm text-forest">
            Total Awarded: {attempt.score} / {attempt.max_score}
          </span>
        </div>
      </div>

      {successBanner && (
        <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* ── Question Grading Feed ── */}
      <div className="space-y-4">
        {attempt.answers.map((ans, idx) => {
          const state = gradingState[ans.question_id] || {
            marks: '0',
            isCorrect: false,
            feedback: '',
            isSaving: false,
            isSaved: false,
            error: null,
          };
          const maxMarks = ans.max_marks || 1;

          return (
            <div
              key={ans.question_id}
              className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3"
            >
              {/* Question Header */}
              <div className="flex items-center justify-between border-b border-border/50 pb-2 text-xs">
                <span className="font-mono font-bold text-forest">
                  Question {idx + 1}
                </span>
                <span className="pill pill-muted text-[10px] py-0.5">
                  Max: {maxMarks} marks
                </span>
              </div>

              {/* Prompt */}
              <p className="text-xs font-heading font-semibold text-ink leading-relaxed">
                {ans.question_text}
              </p>

              {/* Student Answer */}
              <div className="p-2.5 rounded-card bg-bg border border-border space-y-1 text-xs">
                <span className="text-[10px] font-mono text-ink/50 uppercase block">
                  Student's Submitted Answer:
                </span>
                <p className="font-mono text-[11px] text-ink whitespace-pre-wrap">
                  {ans.student_response || '(No response recorded)'}
                </p>
              </div>

              {/* Model Answer (if any) */}
              {ans.correct_answer && (
                <div className="p-2.5 rounded-card bg-forest/5 border border-forest/20 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-forest uppercase font-bold block">
                    Model / Expected Answer:
                  </span>
                  <p className="font-mono text-[11px] text-forest whitespace-pre-wrap">
                    {ans.correct_answer}
                  </p>
                </div>
              )}

              {/* Grading Controls */}
              <div className="p-3 rounded-card bg-surface-muted border border-border space-y-3">
                <span className="text-[11px] font-heading font-semibold text-ink block">
                  Assign Score & Accuracy:
                </span>

                {state.error && (
                  <div className="text-[11px] text-ember font-medium">
                    {state.error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {/* Marks input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-heading font-semibold text-ink block">
                      Awarded Marks
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max={maxMarks}
                      value={state.marks}
                      onChange={(e) =>
                        handleFieldChange(ans.question_id, 'marks', e.target.value)
                      }
                      className="w-full px-3 py-2 rounded-card bg-surface border border-border text-xs font-mono font-bold focus:border-forest focus:outline-none min-h-[40px]"
                    />
                  </div>

                  {/* Correct toggle */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-heading font-semibold text-ink block">
                      Accuracy
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleFieldChange(ans.question_id, 'isCorrect', true)}
                        className={`flex-1 py-2 rounded-card text-xs font-heading font-semibold flex items-center justify-center gap-1 transition-all min-h-[40px] ${
                          state.isCorrect
                            ? 'bg-forest text-white'
                            : 'bg-surface border border-border text-ink/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Right</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFieldChange(ans.question_id, 'isCorrect', false)}
                        className={`flex-1 py-2 rounded-card text-xs font-heading font-semibold flex items-center justify-center gap-1 transition-all min-h-[40px] ${
                          !state.isCorrect
                            ? 'bg-ember text-white'
                            : 'bg-surface border border-border text-ink/60'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Wrong</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Save button for question */}
                <button
                  type="button"
                  onClick={() => handleSaveQuestionGrade(ans.question_id, maxMarks)}
                  disabled={state.isSaving}
                  className={`w-full py-2.5 px-3 rounded-pill font-heading font-semibold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[42px] cursor-pointer ${
                    state.isSaved
                      ? 'bg-forest/15 text-forest border border-forest/30'
                      : 'bg-forest text-white shadow-xs'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{state.isSaving ? 'Saving...' : state.isSaved ? '✓ Grade Saved (Tap to update)' : 'Save Question Score'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
