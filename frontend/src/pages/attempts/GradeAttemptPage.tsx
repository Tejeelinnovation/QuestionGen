import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import { useAuth } from '../../auth/AuthContext';
import type { TeacherAttemptDetail, TeacherAttemptAnswerItem } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { GradeAttemptPageTablet } from '../tablet/attempts/GradeAttemptPageTablet';
import { GradeAttemptPageMobile } from '../mobile/attempts/GradeAttemptPageMobile';

interface GradeFormState {
  marks: string;
  isCorrect: boolean;
  isEditing: boolean;
  isSaving: boolean;
  error: string | null;
}

const GradeAttemptPageDesktop: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const attemptId = Number(id);
  const { dashboardPath } = useAuth();

  const [attempt, setAttempt] = useState<TeacherAttemptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Per-question form state indexed by question_id
  const [gradingState, setGradingState] = useState<Record<number, GradeFormState>>({});

  const fetchAttempt = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await attemptsApi.getTeacherAttemptDetail(attemptId);
      setAttempt(data);

      // Initialize grading state for answers
      const initialMap: Record<number, GradeFormState> = {};
      data.answers.forEach((ans) => {
        const isGraded = ans.marks_awarded !== null;
        initialMap[ans.question_id] = {
          marks: ans.marks_awarded !== null ? String(ans.marks_awarded) : '0',
          isCorrect: ans.is_correct ?? false,
          isEditing: !isGraded,
          isSaving: false,
          error: null,
        };
      });
      setGradingState((prev) => ({ ...initialMap, ...prev }));
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

  const handleGradeChange = (questionId: number, field: 'marks' | 'isCorrect', value: any) => {
    setGradingState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: value,
        error: null,
      },
    }));
  };

  const handleToggleEdit = (questionId: number, editState: boolean) => {
    setGradingState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        isEditing: editState,
        error: null,
      },
    }));
  };

  const handleQuickPreset = (questionId: number, maxMarks: number, preset: 'zero' | 'half' | 'full') => {
    let marksVal = '0';
    let isCorrectVal = false;
    if (preset === 'full') {
      marksVal = String(maxMarks);
      isCorrectVal = true;
    } else if (preset === 'half') {
      marksVal = String(maxMarks / 2);
      isCorrectVal = false;
    }
    setGradingState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        marks: marksVal,
        isCorrect: isCorrectVal,
        error: null,
      },
    }));
  };

  const handleSaveGrade = async (ans: TeacherAttemptAnswerItem) => {
    const qState = gradingState[ans.question_id];
    if (!qState) return;

    const parsedMarks = parseFloat(qState.marks);
    if (isNaN(parsedMarks) || parsedMarks < 0) {
      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          error: 'Marks must be a valid positive number.',
        },
      }));
      return;
    }

    if (parsedMarks > ans.max_marks) {
      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          error: `Marks cannot exceed max marks (${ans.max_marks}).`,
        },
      }));
      return;
    }

    setGradingState((prev) => ({
      ...prev,
      [ans.question_id]: { ...prev[ans.question_id], isSaving: true, error: null },
    }));
    setSuccessBanner(null);

    try {
      const resp = await attemptsApi.gradeAnswer(attemptId, ans.question_id, {
        marks_awarded: parsedMarks,
        is_correct: qState.isCorrect,
      });

      // Update attempt in state with new score and status
      setAttempt((prev) => {
        if (!prev) return null;
        const updatedAnswers = prev.answers.map((a) => {
          if (a.question_id === ans.question_id) {
            return {
              ...a,
              marks_awarded: resp.marks_awarded,
              is_correct: resp.is_correct,
              needs_grading: false,
            };
          }
          return a;
        });

        return {
          ...prev,
          score: resp.attempt_score,
          status: resp.attempt_status,
          answers: updatedAnswers,
        };
      });

      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          isEditing: false,
          isSaving: false,
          marks: String(resp.marks_awarded),
          isCorrect: resp.is_correct,
          error: null,
        },
      }));

      setSuccessBanner(`Grade saved for Question #${ans.question_id}.`);
    } catch (err: any) {
      const errDetail =
        err.response?.data?.marks_awarded ||
        err.response?.data?.detail ||
        'Failed to save grade for this question.';
      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          isSaving: false,
          error: typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail),
        },
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-ink/60 font-body text-sm">
        Opening grading desk for attempt #{attemptId}...
      </div>
    );
  }

  if (errorMessage || !attempt) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4 font-body">
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage || 'Attempt record not found.'}
        </div>
        <Link
          to={dashboardPath}
          className="text-xs font-heading font-semibold text-forest hover:underline"
        >
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  const isEvaluated = attempt.status === 'EVALUATED';
  const pendingCount = attempt.answers.filter((a) => a.marks_awarded === null).length;

  return (
    <div className="max-w-4xl mx-auto pb-20 font-body space-y-8">
      {/* ── TOP UTILITY NAVIGATION ── */}
      <div className="flex items-center justify-between text-xs">
        <Link
          to={`/deliveries/${attempt.delivery}/results`}
          className="font-heading font-semibold text-forest hover:underline flex items-center gap-1"
        >
          ← Return to Results Roster
        </Link>
        <Link
          to={dashboardPath}
          className="font-heading font-medium text-ink/60 hover:text-ink transition-colors"
        >
          Dashboard
        </Link>
      </div>

      {/* ── STICKY RUNNING SCORE & PROGRESS TICKER ── */}
      <div className="sticky top-20 z-30 bg-surface/95 backdrop-blur-sm border border-border rounded-card p-5 shadow-float flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-base text-ink">
              {attempt.paper_title || 'Question Paper'}
            </span>
            <span
              className={`pill text-[10px] font-semibold ${
                isEvaluated ? 'pill-forest' : 'pill-grape'
              }`}
            >
              {isEvaluated ? 'Evaluated' : 'Pending Grading'}
            </span>
          </div>

          <div className="text-xs text-ink/60 font-mono">
            Candidate: <strong className="text-ink font-semibold">{attempt.student_username}</strong> (ID #{attempt.student_id})
          </div>
        </div>

        {/* Live Running Score Ticker */}
        <div className="flex items-center gap-6 self-end sm:self-auto border-t sm:border-t-0 sm:border-l border-border pt-2 sm:pt-0 sm:pl-6">
          <div>
            <div className="text-[10px] font-mono uppercase text-ink/50 mb-0.5">
              Current Score Total
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading font-bold text-2xl sm:text-3xl text-forest">
                {attempt.score !== null ? attempt.score : 0}
              </span>
              <span className="font-heading font-normal text-sm text-ink/40">
                / {attempt.max_score} Marks
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono uppercase text-ink/50 mb-0.5">
              Evaluation Progress
            </div>
            <span
              className={`pill text-xs font-semibold ${
                pendingCount > 0 ? 'pill-ember' : 'pill-forest'
              }`}
            >
              {pendingCount === 0 ? '✓ Complete' : `${pendingCount} Left to Grade`}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-4 text-xs font-semibold flex items-start gap-2">
          <span className="font-bold text-sm">✓</span>
          <span>{successBanner}</span>
        </div>
      )}

      {isEvaluated && (
        <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-4 text-xs font-semibold flex items-center gap-2">
          <span>✓</span>
          <span>All candidate responses evaluated. This attempt is marked as <strong>EVALUATED</strong>.</span>
        </div>
      )}

      {/* ── QUESTION RESPONSES & LOW-FRICTION GRADING CONTROLS ── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <h2 className="font-heading font-bold text-xl text-ink">
            Responses & Grading Rubric
          </h2>
          <span className="font-mono text-xs text-ink/50">
            {attempt.answers.length} Total Questions
          </span>
        </div>

        {attempt.answers.map((ans, idx) => {
          const qState = gradingState[ans.question_id] || {
            marks: '0',
            isCorrect: false,
            isEditing: true,
            isSaving: false,
            error: null,
          };
          const isObjective = ans.question_type === 'MCQ';
          const isGraded = ans.marks_awarded !== null;
          const isPending = !isGraded;

          return (
            <div
              key={ans.question_id}
              className={`bg-surface border rounded-card p-6 shadow-card space-y-4 transition-all ${
                isPending
                  ? 'border-ember/40 bg-surface'
                  : 'border-border'
              }`}
            >
              {/* Question Header */}
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-xs bg-bg border border-border px-2.5 py-1 rounded-sm text-ink">
                    Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>
                  <span className="pill pill-muted text-[10px]">
                    {ans.question_type}
                  </span>
                  <span className="font-mono text-xs text-ink/50">
                    Max: {ans.max_marks} {ans.max_marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>

                <div>
                  {isGraded ? (
                    <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-3 py-1 rounded-pill">
                      Awarded: {ans.marks_awarded} / {ans.max_marks} pts
                    </span>
                  ) : (
                    <span className="pill pill-ember text-[10px] font-semibold">
                      Needs Teacher Grading
                    </span>
                  )}
                </div>
              </div>

              {/* Question Prompt */}
              <p className="font-body text-sm sm:text-base font-medium text-ink leading-relaxed">
                {ans.question_text}
              </p>

              {/* ── VISUALLY DOMINANT: STUDENT'S SUBMITTED RESPONSE ── */}
              <div className="bg-bg border-2 border-border/80 rounded-card p-5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-ink/50">
                  <span>Student's Submitted Response</span>
                  <span className="text-forest font-bold font-heading">Primary Reading Target</span>
                </div>

                {ans.student_response ? (
                  <div className="font-mono text-sm sm:text-base font-semibold text-ink whitespace-pre-wrap leading-relaxed">
                    {ans.student_response}
                  </div>
                ) : (
                  <div className="text-xs italic text-ink/40 font-mono">
                    (No response submitted by candidate)
                  </div>
                )}
              </div>

              {/* Compact Reference Solution block */}
              {ans.correct_answer !== undefined && ans.correct_answer !== null && (
                <div className="bg-forest/5 border border-forest/20 rounded-card p-3.5 text-xs text-forest space-y-1">
                  <span className="font-mono uppercase text-[10px] tracking-wider font-semibold block">
                    Solution Key Reference:
                  </span>
                  <div className="font-mono font-medium">
                    {typeof ans.correct_answer === 'object'
                      ? JSON.stringify(ans.correct_answer)
                      : String(ans.correct_answer)}
                  </div>
                </div>
              )}

              {/* ── FAST, LOW-FRICTION GRADING CONTROLS ── */}
              {isObjective ? (
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink/60 font-mono">
                  <span>Auto-evaluated Objective Question</span>
                  <span
                    className={`font-bold ${
                      ans.is_correct ? 'text-forest' : 'text-ember'
                    }`}
                  >
                    {ans.is_correct ? '✓ Correct Answer' : '✗ Incorrect Answer'} ({ans.marks_awarded} pts)
                  </span>
                </div>
              ) : (
                <div className="pt-3 border-t border-border">
                  {qState.isEditing ? (
                    <div className="bg-surface-muted border border-border rounded-card p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Marks Input & Quick Presets */}
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-heading font-semibold text-ink uppercase">
                            Award Marks:
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={ans.max_marks}
                            value={qState.marks}
                            onChange={(e) =>
                              handleGradeChange(ans.question_id, 'marks', e.target.value)
                            }
                            disabled={qState.isSaving}
                            className="w-20 rounded-card border border-border bg-surface px-3 py-1.5 text-sm font-bold text-ink text-center focus:border-forest focus:outline-none"
                          />
                          <span className="text-xs font-mono text-ink/50">
                            / {ans.max_marks} max
                          </span>

                          {/* Fast Preset Buttons for Repetitive Speed */}
                          <div className="flex items-center gap-1.5 pl-2 border-l border-border">
                            <button
                              type="button"
                              onClick={() => handleQuickPreset(ans.question_id, ans.max_marks, 'zero')}
                              className="px-2 py-1 text-[10px] font-mono rounded bg-surface border border-border text-ink hover:bg-surface-muted cursor-pointer"
                              title="Set 0 marks"
                            >
                              0
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickPreset(ans.question_id, ans.max_marks, 'half')}
                              className="px-2 py-1 text-[10px] font-mono rounded bg-surface border border-border text-ink hover:bg-surface-muted cursor-pointer"
                              title="Set half marks"
                            >
                              ½
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickPreset(ans.question_id, ans.max_marks, 'full')}
                              className="px-2 py-1 text-[10px] font-mono rounded bg-forest/10 border border-forest/30 text-forest font-bold hover:bg-forest/20 cursor-pointer"
                              title="Set full marks"
                            >
                              Full ({ans.max_marks})
                            </button>
                          </div>
                        </div>

                        {/* Correct Toggle & Actions */}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-heading font-medium text-ink">
                            <input
                              type="checkbox"
                              checked={qState.isCorrect}
                              onChange={(e) =>
                                handleGradeChange(ans.question_id, 'isCorrect', e.target.checked)
                              }
                              disabled={qState.isSaving}
                              className="rounded text-forest focus:ring-forest accent-forest"
                            />
                            <span>Mark Correct</span>
                          </label>

                          <div className="flex items-center gap-2">
                            {isGraded && (
                              <button
                                type="button"
                                onClick={() => handleToggleEdit(ans.question_id, false)}
                                disabled={qState.isSaving}
                                className="px-3 py-1.5 text-xs font-heading font-medium rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleSaveGrade(ans)}
                              disabled={qState.isSaving}
                              className="px-5 py-1.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {qState.isSaving ? 'Saving...' : 'Save Grade'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {qState.error && (
                        <p className="text-xs text-ember font-medium pt-1">
                          {qState.error}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-forest">
                          Graded: {ans.marks_awarded} / {ans.max_marks} pts
                        </span>
                        <span
                          className={`pill text-[10px] ${
                            ans.is_correct ? 'pill-forest' : 'pill-ember'
                          }`}
                        >
                          {ans.is_correct ? 'Correct' : 'Partial / Incorrect'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleEdit(ans.question_id, true)}
                        className="font-heading font-semibold text-xs text-forest hover:underline cursor-pointer"
                      >
                        Edit Grade ✎
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── FOOTER NAVIGATION ── */}
      <div className="pt-6 border-t border-border flex items-center justify-between">
        <Link
          to={`/deliveries/${attempt.delivery}/results`}
          className="px-5 py-2.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors"
        >
          ← Return to Results Roster
        </Link>

        <Link
          to={dashboardPath}
          className="text-xs font-heading font-medium text-ink/60 hover:text-ink transition-colors"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
};

export const GradeAttemptPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <GradeAttemptPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <GradeAttemptPageTablet key="tablet" />;
  }
  return <GradeAttemptPageDesktop key="desktop" />;
};

