import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import type { AttemptQuestionItem, AttemptStartResponse } from '../../../types';
import { useExamProctoring } from '../../../hooks/useExamProctoring';
import { ProctoringWarningModal } from '../../../components/attempts/ProctoringWarningModal';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const TestAttemptPageTablet: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);
  const navigate = useNavigate();

  const [attemptData, setAttemptData] = useState<AttemptStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Anti-cheating exam proctoring hook
  const {
    warningCount,
    activeWarning,
    dismissWarning,
    isFullscreen,
    requestFullscreen,
  } = useExamProctoring({
    attemptId: attemptData?.attempt_id,
    isActive: Boolean(attemptData && !isSubmitting && !isExpired),
  });

  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const startOrResume = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await attemptsApi.startOrResumeAttempt(deliveryId);

        if (data.status === 'SUBMITTED' || data.status === 'EVALUATED') {
          navigate(`/attempts/${data.attempt_id}/result`, { replace: true });
          return;
        }

        setAttemptData(data);

        const initialAnswers: Record<number, string> = {};
        const initialStatuses: Record<number, SaveStatus> = {};
        data.questions.forEach((q) => {
          initialAnswers[q.question_id] = q.student_response || '';
          initialStatuses[q.question_id] = q.student_response ? 'saved' : 'idle';
        });
        setAnswers(initialAnswers);
        setSaveStatuses(initialStatuses);

        if (data.available_until && new Date() > new Date(data.available_until)) {
          setIsExpired(true);
        }
      } catch (err: any) {
        const resData = err.response?.data;
        const detail = resData?.detail;
        if (resData?.attempt_id) {
          navigate(`/attempts/${resData.attempt_id}/result`, { replace: true });
          return;
        }
        if (detail === 'This test has expired.') {
          setIsExpired(true);
        }
        setErrorMessage(
          detail || JSON.stringify(err.response?.data) || 'Failed to start or resume test attempt.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (deliveryId) {
      startOrResume();
    }
  }, [deliveryId, navigate]);

  const performSave = useCallback(
    async (attemptId: number, questionId: number, responseText: string) => {
      setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saving' }));
      try {
        await attemptsApi.saveAnswer(attemptId, questionId, responseText);
        setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saved' }));
      } catch (err: any) {
        console.error(`Failed to auto-save answer for question ${questionId}:`, err);
        setSaveStatuses((prev) => ({ ...prev, [questionId]: 'error' }));
      }
    },
    []
  );

  const handleTextChange = (questionId: number, value: string) => {
    if (isExpired || isSubmitting || !attemptData) return;

    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saving' }));

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    debounceTimers.current[questionId] = setTimeout(() => {
      performSave(attemptData.attempt_id, questionId, value);
    }, 600);
  };

  const handleOptionSelect = (questionId: number, optionKey: string) => {
    if (isExpired || isSubmitting || !attemptData) return;

    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    performSave(attemptData.attempt_id, questionId, optionKey);
  };

  const handleSubmit = async () => {
    if (!attemptData || isSubmitting || isExpired) return;

    const confirmed = window.confirm(
      'Are you sure you want to submit your test? You will not be able to make any further changes after submission.'
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await attemptsApi.submitAttempt(attemptData.attempt_id);
      navigate(`/attempts/${result.id}/result`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === 'Attempt has already been submitted.') {
        navigate(`/attempts/${attemptData.attempt_id}/result`);
        return;
      }
      setErrorMessage(
        detail || JSON.stringify(err.response?.data) || 'Failed to submit test attempt.'
      );
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center text-ink/60 font-body text-base">
        Preparing examination environment for tablet...
      </div>
    );
  }

  if (!attemptData) {
    return (
      <div className="p-6 space-y-5 font-body">
        {errorMessage && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-5 text-sm font-medium">
            {errorMessage}
          </div>
        )}
        <div>
          <Link
            to="/dashboard/student"
            className="text-sm font-heading font-semibold text-forest hover:underline inline-flex items-center gap-1.5 py-2"
          >
            ← Return to Student Portal
          </Link>
        </div>
      </div>
    );
  }

  const answeredCount = Object.values(answers).filter((val) => val && val.trim().length > 0).length;
  const totalQuestions = attemptData.questions.length;
  const isAllAnswered = answeredCount === totalQuestions && totalQuestions > 0;

  return (
    <div className="pb-32 font-body space-y-6">
      {/* ── TABLET ASSESSMENT HERO (2-COLUMN BENTO) ── */}
      <div className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          <div className="md:col-span-8 space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-[11px] uppercase tracking-widest text-ink/50 block">
                Active Assessment Session
              </span>
              <span className="pill pill-forest text-xs font-semibold">
                Version {attemptData.version_label}
              </span>
              <span
                className={`pill text-[11px] font-mono font-semibold flex items-center gap-1 ${
                  warningCount > 0
                    ? 'bg-ember/15 text-ember border border-ember/30'
                    : 'bg-forest/10 text-forest border border-forest/20'
                }`}
              >
                <span>🛡️ Proctoring Active</span>
                {warningCount > 0 && <span>({warningCount} Warnings)</span>}
              </span>
            </div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
              {attemptData.paper_title}
            </h1>
            {attemptData.instructions && (
              <p className="text-xs sm:text-sm text-ink/70 leading-relaxed pt-1 bg-bg p-3.5 rounded-card border border-border/60">
                <span className="font-heading font-semibold text-ink block mb-0.5">
                  Candidate Guidelines:
                </span>
                {attemptData.instructions}
              </p>
            )}
          </div>

          <div className="md:col-span-4 bg-bg border border-border/70 rounded-card p-4 space-y-3">
            <div>
              <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider block">
                Completion Progress
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-heading font-bold text-2xl text-ink">
                  {answeredCount}
                </span>
                <span className="text-xs text-ink/40 font-mono">
                  / {totalQuestions} answered
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <span className="text-xs font-mono text-ink/60">Exam Value:</span>
              <span className="font-mono text-xs font-bold text-forest">
                {attemptData.total_marks} Marks
              </span>
            </div>
          </div>
        </div>
      </div>

      {isExpired && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          The scheduled submission window for this assessment has closed. Further changes and answers are disabled.
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── QUESTIONS STREAM (TOUCH-OPTIMIZED, SPACIOUS TARGETS) ── */}
      <div className="space-y-6">
        {attemptData.questions.map((q: AttemptQuestionItem, idx: number) => {
          const currentAnswer = answers[q.question_id] || '';
          const saveStatus = saveStatuses[q.question_id] || 'idle';

          return (
            <div
              key={q.question_id}
              className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-5 transition-all"
            >
              {/* Question Header */}
              <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm bg-bg border border-border px-3 py-1 rounded-sm text-ink">
                    Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>
                  <span className="pill pill-muted text-xs">
                    {q.question_type}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Auto-save status */}
                  <div className="text-xs font-mono">
                    {saveStatus === 'saving' && (
                      <span className="text-ink/50 animate-pulse flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-forest animate-ping" />
                        Saving...
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="text-forest font-medium flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-forest" />
                        Saved
                      </span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="text-ember font-medium flex items-center gap-1.5">
                        ! Save error
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-3 py-1 rounded-pill">
                    {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>
              </div>

              {/* Question Body */}
              <p className="font-body text-base sm:text-lg font-medium text-ink leading-relaxed">
                {q.question_text}
              </p>

              {/* MCQ Options: Minimum 56px touch target, tactile feedback on touch */}
              {q.question_type === 'MCQ' && q.options && (
                <div className="space-y-3 pt-1">
                  {Object.entries(q.options).map(([key, label]) => {
                    const isSelected = currentAnswer.trim().toUpperCase() === key.trim().toUpperCase();

                    return (
                      <div
                        key={key}
                        onClick={() => !isExpired && !isSubmitting && handleOptionSelect(q.question_id, key)}
                        className={`min-h-[56px] p-4 sm:p-5 rounded-card border-2 transition-all cursor-pointer flex items-center gap-4 active:scale-[0.99] select-none ${
                          isSelected
                            ? 'bg-forest text-white border-forest shadow-sm'
                            : 'bg-bg text-ink border-border hover:border-border-strong active:bg-surface-muted'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${q.question_id}`}
                          value={key}
                          checked={isSelected}
                          onChange={() => handleOptionSelect(q.question_id, key)}
                          disabled={isExpired || isSubmitting}
                          className="sr-only"
                        />

                        {/* Large Touch Key Indicator */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-sm shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-white text-forest'
                              : 'bg-surface border border-border text-ink'
                          }`}
                        >
                          {key}
                        </div>

                        {/* Option text */}
                        <span className="text-sm sm:text-base font-medium leading-normal flex-1">
                          {label}
                        </span>

                        {isSelected && (
                          <span className="font-mono text-xs font-bold text-lime shrink-0 px-2 py-1 bg-white/10 rounded">
                            ✓ Selected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SHORT_ANSWER Input */}
              {q.question_type === 'SHORT_ANSWER' && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.question_id, e.target.value)}
                    disabled={isExpired || isSubmitting}
                    placeholder="Tap to enter your answer..."
                    className="w-full min-h-[52px] rounded-card border border-border bg-bg px-4 py-3.5 text-base text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none transition-colors"
                  />
                </div>
              )}

              {/* LONG_ANSWER Textarea */}
              {q.question_type === 'LONG_ANSWER' && (
                <div className="pt-1">
                  <textarea
                    rows={6}
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.question_id, e.target.value)}
                    disabled={isExpired || isSubmitting}
                    placeholder="Provide your complete analytical explanation and solution steps here..."
                    className="w-full min-h-[160px] rounded-card border border-border bg-bg p-4 text-base text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none transition-colors leading-relaxed"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── STICKY COMMITTED SUBMIT ACTION STRIP (TABLET SPECIFIC) ── */}
      <div className="sticky bottom-6 z-30 bg-surface/95 backdrop-blur-md border border-border rounded-card p-4 sm:p-5 shadow-float flex items-center justify-between gap-4">
        <Link
          to="/dashboard/student"
          className="min-h-[48px] px-4 inline-flex items-center text-xs sm:text-sm font-heading font-semibold text-ink/70 hover:text-ink transition-colors"
        >
          ← Pause Test
        </Link>

        <div className="flex items-center gap-5">
          <div className="text-right hidden sm:block">
            <span className="text-xs font-mono text-ink/70 block">
              {isAllAnswered ? (
                <span className="text-forest font-bold">All {totalQuestions} Answered</span>
              ) : (
                <span>{totalQuestions - answeredCount} question(s) uncompleted</span>
              )}
            </span>
            <span className="text-[10px] text-ink/40 block">Cloud auto-saved</span>
          </div>

          <button
            onClick={handleSubmit}
            id="submit-test-btn"
            disabled={isSubmitting || isExpired}
            className="min-h-[48px] px-8 py-3 text-sm font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2 active:scale-95"
          >
            <span>{isSubmitting ? 'Submitting...' : 'Submit Final Test'}</span>
            <span>✓</span>
          </button>
        </div>
      </div>

      {/* Proctoring Warning Modal */}
      <ProctoringWarningModal
        warning={activeWarning}
        totalWarnings={warningCount}
        onDismiss={dismissWarning}
      />
    </div>
  );
};
