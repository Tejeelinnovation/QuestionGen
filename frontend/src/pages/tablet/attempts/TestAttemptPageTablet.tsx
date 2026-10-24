import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import type { AttemptQuestionItem, AttemptStartResponse } from '../../../types';
import { useExamProctoring } from '../../../hooks/useExamProctoring';
import { ProctoringWarningModal } from '../../../components/attempts/ProctoringWarningModal';
import { Maximize2, ShieldAlert, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useExamCountdown } from '../../../hooks/useExamCountdown';
import { ConfirmSubmitModal } from '../../../components/attempts/ConfirmSubmitModal';
import { useOfflineExamSync } from '../../../hooks/useOfflineExamSync';
import { MathText } from '../../../components/ui/MathText';
import { SkeletonExamEnvironment } from '../../../components/ui/skeleton';

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
  const [hasEnteredFullscreen, setHasEnteredFullscreen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Offline resilience hook
  const {
    isOnline,
    pendingCount,
    isSyncing,
    saveAnswer: offlineSaveAnswer,
    flushQueue,
    getStoredAnswers,
    clearOfflineCache,
  } = useOfflineExamSync({
    deliveryId,
    attemptId: attemptData?.attempt_id,
    onAnswerSaved: (qId) => {
      setSaveStatuses((prev) => ({ ...prev, [qId]: 'saved' }));
    },
    onAnswerSaveError: (qId) => {
      setSaveStatuses((prev) => ({ ...prev, [qId]: 'error' }));
    },
  });

  const handleAutoSubmitOnMaxWarnings = useCallback(async () => {
    if (!attemptData || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await attemptsApi.submitAttempt(attemptData.attempt_id);
    } catch {
      // Ignore if already submitted
    } finally {
      clearOfflineCache();
      navigate(`/attempts/${attemptData.attempt_id}/result`, { replace: true });
    }
  }, [attemptData, isSubmitting, navigate, clearOfflineCache]);

  // Reverse countdown timer with auto-submit on 00:00
  const { formattedTime, isUrgent } = useExamCountdown({
    startedAt: attemptData?.started_at,
    durationMinutes: attemptData?.duration_minutes ?? 60,
    availableUntil: attemptData?.available_until,
    onTimeExpired: handleAutoSubmitOnMaxWarnings,
  });

  // Anti-cheating exam proctoring hook
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
          clearOfflineCache();
          navigate(`/attempts/${data.attempt_id}/result`, { replace: true });
          return;
        }

        setAttemptData(data);

        // Merge server answers with local offline cache
        const localBackup = getStoredAnswers();
        const initialAnswers: Record<number, string> = {};
        const initialStatuses: Record<number, SaveStatus> = {};
        data.questions.forEach((q) => {
          const val = q.student_response || localBackup[q.question_id] || '';
          initialAnswers[q.question_id] = val;
          initialStatuses[q.question_id] = q.student_response ? 'saved' : val ? 'saving' : 'idle';
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
          clearOfflineCache();
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
  }, [deliveryId, navigate, clearOfflineCache, getStoredAnswers]);

  const performSave = useCallback(
    async (_attemptId: number, questionId: number, responseText: string) => {
      setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saving' }));
      await offlineSaveAnswer(questionId, responseText);
    },
    [offlineSaveAnswer]
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

  const handleOpenSubmitModal = () => {
    if (!attemptData || isSubmitting || isExpired) return;
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!attemptData || isSubmitting || isExpired) return;

    if (!isOnline) {
      setErrorMessage('You are currently offline. Please reconnect to the internet to submit your final assessment.');
      return;
    }

    if (pendingCount > 0) {
      await flushQueue();
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await attemptsApi.submitAttempt(attemptData.attempt_id);
      clearOfflineCache();
      navigate(`/attempts/${result.id}/result`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === 'Attempt has already been submitted.') {
        clearOfflineCache();
        navigate(`/attempts/${attemptData.attempt_id}/result`);
        return;
      }
      setErrorMessage(
        detail || JSON.stringify(err.response?.data) || 'Failed to submit test attempt.'
      );
      setIsSubmitting(false);
      setShowConfirmModal(false);
    }
  };

  if (isLoading) {
    return <SkeletonExamEnvironment />;
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

              {/* Offline Resilience & Network Indicator */}
              <span
                className={`pill text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                  !isOnline
                    ? 'bg-ember/15 text-ember border border-ember/30 animate-pulse'
                    : isSyncing || pendingCount > 0
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-forest/10 text-forest border border-forest/20'
                }`}
                title={
                  !isOnline
                    ? 'Tablet Offline: Answers cached locally and will auto-sync on reconnect'
                    : pendingCount > 0
                    ? `${pendingCount} answer(s) syncing...`
                    : 'Connected & synchronized'
                }
              >
                {!isOnline ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-ember" />
                    <span>Offline (Cached Locally)</span>
                  </>
                ) : isSyncing || pendingCount > 0 ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                    <span>Syncing ({pendingCount} queued)</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-forest" />
                    <span>Connected</span>
                  </>
                )}
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

      {/* Network drop alert for tablet */}
      {!isOnline && (
        <div className="rounded-card border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 p-4 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>Tablet offline.</strong> Responses are securely cached on this device and will automatically sync when network connection resumes.
            </span>
          </div>
          <button
            type="button"
            onClick={() => flushQueue()}
            className="px-3 py-1.5 rounded-pill bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          >
            Retry Sync Now
          </button>
        </div>
      )}

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
                        <span>! Save error</span>
                        <button
                          type="button"
                          onClick={() => performSave(attemptData.attempt_id, q.question_id, currentAnswer)}
                          className="underline text-ember hover:text-ember/80 font-semibold cursor-pointer active:scale-95"
                          title="Click to retry saving this answer"
                        >
                          Retry
                        </button>
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-3 py-1 rounded-pill">
                    {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>
              </div>

              {/* Question Body with KaTeX Math rendering */}
              <MathText
                text={q.question_text}
                as="p"
                className="font-body text-base sm:text-lg font-medium text-ink leading-relaxed"
              />

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

                        {/* Option text with MathText rendering */}
                        <MathText text={String(label)} className="text-sm sm:text-base font-medium leading-normal flex-1" />

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
        <div className="min-h-[48px] px-4 inline-flex items-center gap-2 text-xs sm:text-sm font-heading font-medium text-ink/60">
          <ShieldAlert className="w-4 h-4 text-forest shrink-0" />
          <span>Live Monitored Exam • Pausing Disabled</span>
        </div>

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
            onClick={handleOpenSubmitModal}
            id="submit-test-btn"
            disabled={isSubmitting || isExpired}
            className="min-h-[48px] px-8 py-3 text-sm font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2 active:scale-95"
          >
            <span>{isSubmitting ? 'Submitting...' : 'Submit Final Test'}</span>
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
