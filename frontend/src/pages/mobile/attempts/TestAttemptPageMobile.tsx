import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import type { AttemptStartResponse } from '../../../types';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Shield,
  Clock,
} from 'lucide-react';
import { useExamProctoring } from '../../../hooks/useExamProctoring';
import { useExamCountdown } from '../../../hooks/useExamCountdown';
import { ProctoringWarningModal } from '../../../components/attempts/ProctoringWarningModal';
import { ConfirmSubmitModal } from '../../../components/attempts/ConfirmSubmitModal';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const TestAttemptPageMobile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);
  const navigate = useNavigate();

  const [attemptData, setAttemptData] = useState<AttemptStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

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

  // Anti-cheating exam proctoring hook
  const {
    warningCount,
    activeWarning,
    dismissWarning,
  } = useExamProctoring({
    attemptId: attemptData?.attempt_id,
    initialWarningCount: attemptData?.warning_count ?? 0,
    isActive: Boolean(attemptData && !isSubmitting && !isExpired),
    maxWarnings: 5,
    onMaxWarningsReached: handleAutoSubmitOnMaxWarnings,
  });

  // Reverse countdown timer
  const { formattedTime, isUrgent } = useExamCountdown({
    startedAt: attemptData?.started_at,
    durationMinutes: attemptData?.duration_minutes ?? 60,
    availableUntil: attemptData?.available_until,
    onTimeExpired: handleAutoSubmitOnMaxWarnings,
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

  // Swipe detection refs
  const touchStartX = useRef<number | null>(null);

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
          detail || 'Failed to start assessment. Please try again.'
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

  const handleMcqSelect = (questionId: number, optionKey: string) => {
    if (isExpired || isSubmitting || !attemptData) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
    performSave(attemptData.attempt_id, questionId, optionKey);
  };

  const handleSubmitAttempt = async () => {
    if (!attemptData || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await attemptsApi.submitAttempt(attemptData.attempt_id);
      navigate(`/attempts/${attemptData.attempt_id}/result`, { replace: true });
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to submit test attempt.';
      setErrorMessage(detail);
      setShowSubmitModal(false);
      setIsSubmitting(false);
    }
  };

  // Touch Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !attemptData) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      // Swiped Left -> Next
      if (diff > 0 && currentIndex < attemptData.questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
      // Swiped Right -> Prev
      else if (diff < 0 && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    }
    touchStartX.current = null;
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center text-xs text-ink/60 font-body">
        Connecting to test engine...
      </div>
    );
  }

  if (errorMessage && !attemptData) {
    return (
      <div className="space-y-4 font-body py-6">
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage}
        </div>
        <Link
          to="/dashboard/student"
          className="w-full py-3 px-4 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold flex items-center justify-center"
        >
          Return to Student Portal
        </Link>
      </div>
    );
  }

  if (!attemptData || attemptData.questions.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card space-y-3">
        <p>No questions found for this test.</p>
        <Link to="/dashboard/student" className="text-forest underline font-semibold">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const currentQ = attemptData.questions[currentIndex];
  const totalQuestions = attemptData.questions.length;
  const currentAnswer = answers[currentQ.question_id] || '';
  const currentStatus = saveStatuses[currentQ.question_id] || 'idle';
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const answeredCount = Object.values(answers).filter((a) => a.trim().length > 0).length;

  return (
    <div
      className="space-y-4 font-body select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top Focus Status Header ── */}
      <div className="p-3.5 rounded-card bg-surface border border-border shadow-xs flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <span className="font-heading font-bold text-xs text-ink block truncate max-w-[170px]">
            {attemptData.paper_title || 'Assessment'}
          </span>
          <div className="text-[11px] font-mono text-ink/60">
            Question <span className="font-bold text-forest">{currentIndex + 1}</span> of {totalQuestions}
          </div>
        </div>

        {/* Countdown, Auto-Save, Proctoring & Marks Pills */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`pill text-[10px] py-0.5 px-2 font-mono font-bold flex items-center gap-1 ${
              isUrgent
                ? 'bg-ember/15 text-ember border border-ember/30 animate-pulse'
                : 'bg-forest/10 text-forest border border-forest/20'
            }`}
            title="Time Remaining"
          >
            <Clock className={`w-3 h-3 ${isUrgent ? 'text-ember' : 'text-forest'}`} />
            <span>{formattedTime}</span>
          </span>

          <span
            className={`pill text-[10px] py-0.5 px-2 flex items-center gap-1 ${
              warningCount > 0
                ? 'bg-ember/15 text-ember border border-ember/30'
                : 'bg-forest/10 text-forest border border-forest/20'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>{warningCount > 0 ? `${warningCount}W` : 'Prot'}</span>
          </span>

          <span
            className={`pill text-[10px] py-0.5 px-2 ${
              currentStatus === 'saving'
                ? 'pill-ember animate-pulse'
                : currentStatus === 'saved'
                ? 'pill-forest'
                : 'pill-muted'
            }`}
          >
            {currentStatus === 'saving' ? 'Saving...' : currentStatus === 'saved' ? '✓ Saved' : 'Draft'}
          </span>

          <span className="pill pill-muted text-[10px] py-0.5 px-2">
            {currentQ.marks || 1} mark{(currentQ.marks || 1) === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* ── Question Quick-Jump Mini Bar ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {attemptData.questions.map((q, idx) => {
          const isAnswered = !!answers[q.question_id]?.trim();
          const isCurrent = idx === currentIndex;

          return (
            <button
              key={q.question_id}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`w-8 h-8 rounded-pill font-mono text-xs font-bold shrink-0 transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-forest text-white shadow-xs scale-105'
                  : isAnswered
                  ? 'bg-forest/15 text-forest border border-forest/30'
                  : 'bg-surface border border-border text-ink/50'
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* ── One Question View Card ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-4 min-h-[260px] flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-ink/60 border-b border-border/50 pb-2">
            <span className="font-mono uppercase font-semibold">
              Type: {currentQ.question_type}
            </span>
            <span className="text-ink/40">Swipe left / right to navigate</span>
          </div>

          {/* Prompt */}
          <h2 className="font-heading font-bold text-sm sm:text-base text-ink leading-relaxed">
            {currentQ.question_text}
          </h2>

          {/* Response area: MCQ or Textarea */}
          {currentQ.question_type === 'MCQ' && currentQ.options ? (
            <div className="space-y-2 pt-2">
              {Object.entries(currentQ.options).map(([key, optText]) => {
                const isSelected = currentAnswer === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleMcqSelect(currentQ.question_id, key)}
                    className={`w-full p-3.5 rounded-card text-left flex items-center justify-between border transition-all active:scale-[0.99] cursor-pointer min-h-[48px] ${
                      isSelected
                        ? 'bg-forest text-white border-forest shadow-xs'
                        : 'bg-surface border-border text-ink hover:border-forest/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-6 h-6 rounded-pill text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-white text-forest' : 'bg-surface-muted text-ink/70 border border-border'
                        }`}
                      >
                        {key}
                      </span>
                      <span className="text-xs sm:text-sm font-body leading-snug">
                        {optText}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pt-2">
              <textarea
                value={currentAnswer}
                onChange={(e) => handleTextChange(currentQ.question_id, e.target.value)}
                placeholder="Compose your response here. Autosaves automatically..."
                rows={5}
                className="w-full p-3.5 rounded-card bg-surface border border-border text-xs sm:text-sm font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none resize-none leading-relaxed"
              />
            </div>
          )}
        </div>

        {/* Swipe hint */}
        <div className="text-center pt-2 text-[10px] text-ink/40 font-mono">
          ← Swipe or tap buttons below to advance →
        </div>
      </div>

      {/* ── Bottom Controls & Submit ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="flex-1 py-3 px-3 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center gap-1 min-h-[48px]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {!isLastQuestion ? (
            <button
              type="button"
              id="mobile-next-question-btn"
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              className="flex-1 py-3 px-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-1 min-h-[48px]"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              id="mobile-submit-modal-btn"
              onClick={() => setShowSubmitModal(true)}
              className="flex-1 py-3 px-3 rounded-pill bg-ember text-white font-heading font-semibold text-xs active:scale-95 transition-all shadow-xs flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Finish Test</span>
            </button>
          )}
        </div>

        {!isLastQuestion && (
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="w-full text-center text-xs text-ink/60 hover:text-ink font-heading font-semibold py-1 cursor-pointer"
          >
            Review & Submit Assessment ({answeredCount}/{totalQuestions} completed)
          </button>
        )}
      </div>

      {/* Custom in-DOM Submission Confirmation Modal */}
      <ConfirmSubmitModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onConfirm={handleSubmitAttempt}
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
