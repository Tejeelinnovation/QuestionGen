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
import { Maximize2, ShieldAlert, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useExamCountdown } from '../../hooks/useExamCountdown';
import { ConfirmSubmitModal } from '../../components/attempts/ConfirmSubmitModal';
import { useOfflineExamSync } from '../../hooks/useOfflineExamSync';
import { MathText } from '../../components/ui/MathText';

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
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Offline resilience hook: caches answers in localStorage and auto-syncs on reconnect
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
          clearOfflineCache();
          navigate(`/attempts/${data.attempt_id}/result`, { replace: true });
          return;
        }

        setAttemptData(data);

        // Initialize answers map: Merge server responses with any offline cached entries
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

        // Check if delivery available_until has already passed
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

  // Actual API save function with offline local resilience
  const performSave = useCallback(
    async (_attemptId: number, questionId: number, responseText: string) => {
      setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saving' }));
      await offlineSaveAnswer(questionId, responseText);
    },
    [offlineSaveAnswer]
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
  const handleOptionSelect = useCallback(
    (questionId: number, optionKey: string) => {
      if (isExpired || isSubmitting || !attemptData) return;

      setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));

      if (debounceTimers.current[questionId]) {
        clearTimeout(debounceTimers.current[questionId]);
      }

      performSave(attemptData.attempt_id, questionId, optionKey);
    },
    [isExpired, isSubmitting, attemptData, performSave]
  );

  // Keyboard navigation for students:
  // Alt+Down / Alt+Up to jump between questions
  // 1-4 or A-D to select options when not typing in text inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isExpired || isSubmitting || !attemptData) return;

      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'j')) {
        e.preventDefault();
        setActiveQuestionIndex((prev) => {
          const next = Math.min(prev + 1, attemptData.questions.length - 1);
          questionRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
        return;
      }

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'k')) {
        e.preventDefault();
        setActiveQuestionIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          questionRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
        return;
      }

      if (!isInput && attemptData.questions[activeQuestionIndex]) {
        const q = attemptData.questions[activeQuestionIndex];
        if (q.question_type === 'MCQ' && q.options) {
          const optKeys = Object.keys(q.options);
          const pressed = e.key.toUpperCase();
          let targetKey: string | null = null;
          if (['1', '2', '3', '4'].includes(pressed)) {
            const numIdx = parseInt(pressed, 10) - 1;
            if (numIdx < optKeys.length) targetKey = optKeys[numIdx];
          } else if (optKeys.includes(pressed)) {
            targetKey = pressed;
          }
          if (targetKey) {
            e.preventDefault();
            handleOptionSelect(q.question_id, targetKey);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [attemptData, activeQuestionIndex, isExpired, isSubmitting, handleOptionSelect]);

  const handleOpenSubmitModal = () => {
    if (!attemptData || isSubmitting || isExpired) return;
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!attemptData || isSubmitting || isExpired) return;

    if (!isOnline) {
      toast.error('You are currently offline. Please reconnect to the internet to submit your final assessment.');
      return;
    }

    if (pendingCount > 0) {
      toast.info(`Flushing ${pendingCount} offline answer(s) to server before submitting...`);
      await flushQueue();
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await attemptsApi.submitAttempt(attemptData.attempt_id);
      clearOfflineCache();
      toast.success('Exam submitted successfully! Generating result analysis...');
      navigate(`/attempts/${result.id}/result`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === 'Attempt has already been submitted.') {
        clearOfflineCache();
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
                  ? 'Network offline: Answers are safely stored locally on this device'
                  : pendingCount > 0
                  ? `${pendingCount} answer(s) syncing to server...`
                  : 'Online & synchronized with assessment server'
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

        {/* Understated typographic progress in header area */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-ink/60">Answered:</span>
            <span className="font-heading font-bold text-sm text-ink">
              {answeredCount} of {totalQuestions}
            </span>
            <span className="text-ink/40 font-mono">questions completed</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] font-mono text-ink/50">
              Shortcuts: <kbd className="px-1.5 py-0.5 bg-bg border rounded text-[10px]">Alt+↓/↑</kbd> Navigate • <kbd className="px-1.5 py-0.5 bg-bg border rounded text-[10px]">1-4 / A-D</kbd> Select
            </span>
            <div className="font-mono text-xs text-ink/70">
              Total Value: <span className="font-bold text-forest">{attemptData.total_marks} Marks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Network drop offline warning alert with sync retry */}
      {!isOnline && (
        <div className="rounded-card border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 p-4 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>Internet connection offline.</strong> Your answers are safely preserved in browser local storage. They will automatically sync to the server as soon as connection is re-established.
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
          const isActive = activeQuestionIndex === idx;

          return (
            <div
              key={q.question_id}
              ref={(el) => {
                questionRefs.current[idx] = el;
              }}
              onClick={() => setActiveQuestionIndex(idx)}
              className={`bg-surface border rounded-card p-6 sm:p-7 shadow-card space-y-4 transition-all ${
                isActive ? 'border-forest/50 ring-1 ring-forest/20' : 'border-border'
              }`}
            >
              {/* Question Header Bar with subtle peripheral auto-save indicator */}
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded-sm ${
                    isActive ? 'bg-forest text-white' : 'bg-bg border border-border text-ink'
                  }`}>
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

                  <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-2.5 py-0.5 rounded-pill">
                    {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>
              </div>

              {/* Question Text with KaTeX STEM Math & Chemistry Rendering */}
              <MathText
                text={q.question_text}
                as="p"
                className="font-body text-base font-medium text-ink leading-relaxed"
              />

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

                        {/* Option text with MathText rendering */}
                        <MathText text={String(label)} className="text-sm font-medium leading-normal flex-1" />

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

