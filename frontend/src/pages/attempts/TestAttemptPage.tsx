import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import { useToast } from '../../context/ToastContext';
import type { AttemptQuestionItem, AttemptStartResponse } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useExamProctoring } from '../../hooks/useExamProctoring';
import { ProctoringWarningModal } from '../../components/attempts/ProctoringWarningModal';
import { TestAttemptPageTablet } from '../tablet/attempts/TestAttemptPageTablet';
import { TestAttemptPageMobile } from '../mobile/attempts/TestAttemptPageMobile';
import { Maximize2, ShieldAlert, Clock } from 'lucide-react';
import { useExamCountdown } from '../../hooks/useExamCountdown';
import { ConfirmSubmitModal } from '../../components/attempts/ConfirmSubmitModal';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const TestAttemptPageDesktop: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [attemptData, setAttemptData] = useState<AttemptStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [hasEnteredFullscreen, setHasEnteredFullscreen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleAutoSubmitOnMaxWarnings = useCallback(async () => {
    if (!attemptData || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await attemptsApi.submitAttempt(attemptData.attempt_id);
    } catch {
      // Ignore if already submitted
    } finally {
      navigate(`/attempts/${attemptData.attempt_id}/result`, { replace: true });
    }
  }, [attemptData, isSubmitting, navigate]);

  // Reverse countdown timer with auto-submit on 00:00
  const { formattedTime, isUrgent } = useExamCountdown({
    startedAt: attemptData?.started_at,
    durationMinutes: attemptData?.duration_minutes ?? 60,
    availableUntil: attemptData?.available_until,
    onTimeExpired: handleAutoSubmitOnMaxWarnings,
  });

  // Anti-cheating exam proctoring hook with persistent warning count & auto-submit
  const {
    warningCount,
    activeWarning,
    dismissWarning,
    isFullscreen,
    requestFullscreen,
  } = useExamProctoring({
    attemptId: attemptData?.attempt_id,
    initialWarningCount: attemptData?.warning_count ?? 0,
    isActive: Boolean(attemptData && !isSubmitting && !isExpired),
    hasStarted: hasEnteredFullscreen,
    maxWarnings: 5,
    onMaxWarningsReached: handleAutoSubmitOnMaxWarnings,
  });

  // Debounce timers map
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Prevent student from closing or reloading tab without warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (attemptData && !isSubmitting && !isExpired) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [attemptData, isSubmitting, isExpired]);

  useEffect(() => {
    const startOrResume = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await attemptsApi.startOrResumeAttempt(deliveryId);

        // If already submitted or evaluated, redirect straight to result
        if (data.status === 'SUBMITTED' || data.status === 'EVALUATED') {
          navigate(`/attempts/${data.attempt_id}/result`, { replace: true });
          return;
        }

        setAttemptData(data);

        // Initialize answers map from existing student_responses
        const initialAnswers: Record<number, string> = {};
        const initialStatuses: Record<number, SaveStatus> = {};
        data.questions.forEach((q) => {
          initialAnswers[q.question_id] = q.student_response || '';
          initialStatuses[q.question_id] = q.student_response ? 'saved' : 'idle';
        });
        setAnswers(initialAnswers);
        setSaveStatuses(initialStatuses);

        // Check if delivery available_until has already passed
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

  // Actual API save function
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

  // Debounced handler for text inputs
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

  // Immediate handler for option select (MCQ)
  const handleOptionSelect = (questionId: number, optionKey: string) => {
    if (isExpired || isSubmitting || !attemptData) return;

    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    performSave(attemptData.attempt_id, questionId, optionKey);
  };

  const handleOpenSubmitModal = () => {
    if (!attemptData || isSubmitting || isExpired) return;
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!attemptData || isSubmitting || isExpired) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await attemptsApi.submitAttempt(attemptData.attempt_id);
      toast.success('Exam submitted successfully! Generating result analysis...');
      navigate(`/attempts/${result.id}/result`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === 'Attempt has already been submitted.') {
        toast.info('Attempt has already been submitted.');
        navigate(`/attempts/${attemptData.attempt_id}/result`);
        return;
      }
      const errDetail = detail || JSON.stringify(err.response?.data) || 'Failed to submit test attempt.';
      setErrorMessage(errDetail);
      toast.error(errDetail);
      setIsSubmitting(false);
      setShowConfirmModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-ink/60 font-body text-sm">
        Preparing examination environment...
      </div>
    );
  }

  if (!attemptData) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4 font-body">
        {errorMessage && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
            {errorMessage}
          </div>
        )}
        <div>
          <Link
            to="/dashboard/student"
            className="text-xs font-heading font-semibold text-forest hover:underline"
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
    <div className="max-w-3xl mx-auto pb-24 font-body space-y-8">
      {/* ── MANDATORY SECURE FULLSCREEN GATE & MONITORING LOCK ── */}
      {!isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/95 backdrop-blur-md animate-in fade-in">
          <div className="max-w-md w-full bg-surface border border-forest/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center mx-auto text-forest">
              <Maximize2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading font-bold text-xl text-ink">
                {hasEnteredFullscreen ? 'Assessment Locked: Full Screen Required' : 'Full-Screen Assessment Mode Required'}
              </h2>
              <p className="text-xs text-ink/70 leading-relaxed">
                {hasEnteredFullscreen
                  ? 'You exited full-screen mode. To maintain test integrity, questions are hidden until you return to full-screen view.'
                  : 'This examination is proctored with active anti-cheating controls. You must enter and remain in full-screen mode before accessing questions.'}
              </p>
            </div>

            <div className="rounded-card bg-surface-muted/60 border border-border p-3.5 text-left text-xs font-mono text-ink/75 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-forest shrink-0" />
                <span>Tab switching & window minimizing recorded</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-forest shrink-0" />
                <span>Clipboard shortcuts & developer tools are blocked</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-ember shrink-0" />
                <span>Exceeding 5 warnings will auto-submit exam</span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                await requestFullscreen();
                setHasEnteredFullscreen(true);
              }}
              className="w-full py-3.5 px-6 rounded-pill bg-forest text-white font-heading font-semibold text-sm hover:bg-forest/90 shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
            >
              <Maximize2 className="w-4 h-4" />
              <span>{hasEnteredFullscreen ? 'Return to Full Screen to Continue' : 'Enter Full Screen & Begin Assessment'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CALM, RESTRAINED EXAMINATION HEADER ── */}
      <div className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-border/70 pb-4">
          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50 block">
              Active Assessment Session
            </span>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
              {attemptData.paper_title}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!isFullscreen && (
              <button
                type="button"
                onClick={requestFullscreen}
                className="px-3 py-1.5 rounded-pill bg-forest/10 border border-forest/20 text-forest text-xs font-semibold hover:bg-forest/20 transition-all cursor-pointer flex items-center gap-1.5"
                title="Enter full-screen mode for exam sitting"
              >
                <span>⛶</span>
                <span>Enter Fullscreen</span>
              </button>
            )}

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

            {/* Reverse Countdown Timer */}
            <span
              className={`pill text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                isUrgent
                  ? 'bg-ember/15 text-ember border border-ember/30 animate-pulse'
                  : 'bg-forest/10 text-forest border border-forest/20'
              }`}
              title="Time remaining in this examination"
            >
              <Clock className={`w-3.5 h-3.5 ${isUrgent ? 'text-ember' : 'text-forest'}`} />
              <span>{formattedTime} remaining</span>
            </span>

            <span className="pill pill-forest text-[11px] font-semibold">
              Version {attemptData.version_label}
            </span>
          </div>
        </div>

        {attemptData.instructions && (
          <div className="text-xs text-ink/70 leading-relaxed bg-bg p-3.5 rounded-card border border-border/60">
            <span className="font-heading font-semibold text-ink block mb-0.5">
              Candidate Guidelines:
            </span>
            {attemptData.instructions}
          </div>
        )}

        {/* Understated typographic progress in header area (no loud progress bars) */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-ink/60">Answered:</span>
            <span className="font-heading font-bold text-sm text-ink">
              {answeredCount} of {totalQuestions}
            </span>
            <span className="text-ink/40 font-mono">questions completed</span>
          </div>

          <div className="font-mono text-xs text-ink/70">
            Total Value: <span className="font-bold text-forest">{attemptData.total_marks} Marks</span>
          </div>
        </div>
      </div>

      {isExpired && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          The scheduled submission window for this assessment has closed. Further changes and answers are disabled.
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── QUESTIONS STREAM (GENEROUS WHITESPACE, UNAMBIGUOUS INPUTS) ── */}
      <div className="space-y-6">
        {attemptData.questions.map((q: AttemptQuestionItem, idx: number) => {
          const currentAnswer = answers[q.question_id] || '';
          const saveStatus = saveStatuses[q.question_id] || 'idle';

          return (
            <div
              key={q.question_id}
              className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-4 transition-all"
            >
              {/* Question Header Bar with subtle peripheral auto-save indicator */}
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-xs bg-bg border border-border px-2.5 py-1 rounded-sm text-ink">
                    Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>
                  <span className="pill pill-muted text-[10px]">
                    {q.question_type}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Subtle, peripheral auto-save feedback at top-right */}
                  <div className="text-[11px] font-mono">
                    {saveStatus === 'saving' && (
                      <span className="text-ink/50 animate-pulse flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-forest animate-ping" />
                        Saving...
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="text-forest font-medium flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-forest" />
                        Saved
                      </span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="text-ember font-medium flex items-center gap-1">
                        ! Save error
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-2.5 py-0.5 rounded-pill">
                    {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>
              </div>

              {/* Question Text */}
              <p className="font-body text-base font-medium text-ink leading-relaxed">
                {q.question_text}
              </p>

              {/* MCQ Options: Large, clearly clickable tactile blocks with FOREST fill on selected state */}
              {q.question_type === 'MCQ' && q.options && (
                <div className="space-y-2.5 pt-2">
                  {Object.entries(q.options).map(([key, label]) => {
                    const isSelected = currentAnswer.trim().toUpperCase() === key.trim().toUpperCase();

                    return (
                      <div
                        key={key}
                        onClick={() => !isExpired && !isSubmitting && handleOptionSelect(q.question_id, key)}
                        className={`p-4 rounded-card border-2 transition-all cursor-pointer flex items-center gap-3.5 ${
                          isSelected
                            ? 'bg-forest text-white border-forest shadow-sm'
                            : 'bg-bg text-ink border-border hover:bg-surface-muted hover:border-border-strong'
                        }`}
                      >
                        {/* Hidden accessible radio */}
                        <input
                          type="radio"
                          name={`q_${q.question_id}`}
                          value={key}
                          checked={isSelected}
                          onChange={() => handleOptionSelect(q.question_id, key)}
                          disabled={isExpired || isSubmitting}
                          className="sr-only"
                        />

                        {/* Distinct Key Indicator */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-white text-forest'
                              : 'bg-surface border border-border text-ink'
                          }`}
                        >
                          {key}
                        </div>

                        {/* Option text */}
                        <span className="text-sm font-medium leading-normal flex-1">
                          {label}
                        </span>

                        {isSelected && (
                          <span className="font-mono text-xs font-bold text-lime shrink-0">
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
                <div className="pt-2">
                  <input
                    type="text"
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.question_id, e.target.value)}
                    disabled={isExpired || isSubmitting}
                    placeholder="Type your answer response here..."
                    className="w-full rounded-card border border-border bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none transition-colors"
                  />
                </div>
              )}

              {/* LONG_ANSWER Textarea */}
              {q.question_type === 'LONG_ANSWER' && (
                <div className="pt-2">
                  <textarea
                    rows={5}
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.question_id, e.target.value)}
                    disabled={isExpired || isSubmitting}
                    placeholder="Provide your complete analytical explanation and solution steps here..."
                    className="w-full rounded-card border border-border bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none transition-colors leading-relaxed"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── WEIGHTY COMMITTED SUBMIT ACTION STRIP (STICKY BOTTOM) ── */}
      <div className="sticky bottom-4 z-30 bg-surface/95 backdrop-blur-sm border border-border rounded-card p-4 sm:p-5 shadow-float flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-heading font-medium text-ink/60 self-start sm:self-auto">
          <ShieldAlert className="w-4 h-4 text-forest shrink-0" />
          <span>Live Monitored Exam • Pausing Disabled</span>
        </div>

        <div className="flex items-center gap-4 self-end sm:self-auto">
          <div className="text-right">
            <span className="text-xs font-mono text-ink/70 block">
              {isAllAnswered ? (
                <span className="text-forest font-bold">All {totalQuestions} Questions Answered</span>
              ) : (
                <span>{totalQuestions - answeredCount} question(s) uncompleted</span>
              )}
            </span>
            <span className="text-[10px] text-ink/40 block">Answers auto-saved to cloud</span>
          </div>

          {/* Heavy, high-contrast committed submit button */}
          <button
            onClick={handleOpenSubmitModal}
            id="submit-test-btn"
            disabled={isSubmitting || isExpired}
            className="px-7 py-3 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <span>{isSubmitting ? 'Submitting Assessment...' : 'Submit Final Test'}</span>
            <span>✓</span>
          </button>
        </div>
      </div>

      {/* Custom Confirm Submit Modal (No native JS alert/blur) */}
      <ConfirmSubmitModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSubmit}
        isSubmitting={isSubmitting}
        answeredCount={answeredCount}
        totalQuestions={totalQuestions}
        formattedTimeRemaining={formattedTime}
        isTimeUrgent={isUrgent}
      />

      {/* Proctoring Warning Modal */}
      <ProctoringWarningModal
        warning={activeWarning}
        totalWarnings={warningCount}
        onDismiss={dismissWarning}
      />
    </div>
  );
};

export const TestAttemptPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <TestAttemptPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <TestAttemptPageTablet key="tablet" />;
  }
  return <TestAttemptPageDesktop key="desktop" />;
};

