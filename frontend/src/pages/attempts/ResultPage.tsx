import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import type { StudentAttemptResult } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ResultPageTablet } from '../tablet/attempts/ResultPageTablet';
import { ResultPageMobile } from '../mobile/attempts/ResultPageMobile';

const ResultPageDesktop: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const attemptId = Number(id);

  const [result, setResult] = useState<StudentAttemptResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await attemptsApi.getAttemptResult(attemptId);
        setResult(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load test attempt results from server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (attemptId) {
      fetchResult();
    }
  }, [attemptId]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-ink/60 font-body text-sm">
        Compiling assessment evaluation report...
      </div>
    );
  }

  if (errorMessage || !result) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4 font-body">
        {errorMessage && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
            {errorMessage}
          </div>
        )}
        <Link
          to="/dashboard/student"
          className="text-xs font-heading font-semibold text-forest hover:underline"
        >
          ← Return to Student Portal
        </Link>
      </div>
    );
  }

  const isEvaluated = result.status === 'EVALUATED';
  const isSubmitted = result.status === 'SUBMITTED';
  const percentage =
    result.max_score > 0 ? ((result.score / result.max_score) * 100).toFixed(1) : '0.0';

  const pendingQuestionsCount = result.answers?.filter((a) => a.pending_manual_review).length || 0;

  return (
    <div className="max-w-3xl mx-auto pb-16 font-body space-y-8">
      {/* ── HEADER NAVIGATION ── */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Evaluation Report • Attempt #{result.id}
          </div>
          <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
            {result.paper_title || `Assessment #${result.id}`}
          </h1>
          <p className="text-xs text-ink/60 font-mono">
            Submitted on {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : '—'}
          </p>
        </div>

        <Link
          to="/dashboard/student"
          className="text-xs font-heading font-semibold text-ink/70 hover:text-ink px-4 py-2 rounded-pill border border-border bg-surface hover:bg-surface-muted transition-colors self-start sm:self-auto"
        >
          ← Student Portal
        </Link>
      </div>

      {/* ── INFORMATIONAL PENDING REVIEW BANNER (NON-ALARMING GRAPE ACCENT) ── */}
      {(isSubmitted || pendingQuestionsCount > 0) && (
        <div
          id="pending-review-banner"
          className="rounded-card border border-grape/30 bg-grape/10 p-5 text-ink space-y-1 shadow-card animate-card-enter"
        >
          <div className="flex items-center gap-2">
            <span className="pill pill-grape text-[10px] font-semibold">
              Subjective Evaluation Pending
            </span>
          </div>
          <p className="text-xs text-ink/80 leading-relaxed pt-1">
            Some answers are currently pending manual teacher review. Your objective MCQ score is tabulated below; your final grade will update once your instructor evaluates open-ended responses.
          </p>
        </div>
      )}

      {/* ── SCORE AS VISUAL HERO (BOLD SPACE GROTESK TYPOGRAPHY) ── */}
      <div className="bg-surface border border-border rounded-card p-7 sm:p-8 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50">
            Total Assessment Score
          </div>
          <div className="flex items-baseline gap-2" id="result-score-display">
            <span className="font-heading font-bold text-5xl sm:text-6xl text-forest tracking-tight">
              {result.score % 1 === 0 ? result.score : result.score.toFixed(1)}
            </span>
            <span className="font-heading font-normal text-2xl text-ink/40">
              / {result.max_score}
            </span>
            <span className="text-xs font-mono font-semibold text-ink/60 pl-1">Marks</span>
          </div>
        </div>

        <div className="flex items-center gap-8 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-8">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50 mb-1">
              Percentage
            </div>
            <div className="font-heading font-bold text-3xl sm:text-4xl text-ink">
              {percentage}%
            </div>
          </div>

          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50 mb-1">
              Attempt Status
            </div>
            {/* Consistent status badges */}
            <span
              className={`pill text-xs font-semibold ${
                isEvaluated ? 'pill-forest' : 'pill-grape'
              }`}
            >
              {isEvaluated ? 'Evaluated' : 'Submitted'}
            </span>
          </div>
        </div>
      </div>

      {/* ── DETAILED QUESTION BREAKDOWN (COLOR-CODED LEFT BORDERS) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Detailed Question Analysis
            </h2>
            <p className="text-xs text-ink/60">
              Review answers, awarded marks, and official solution guides
            </p>
          </div>
          <span className="font-mono text-xs text-ink/50">
            {result.answers?.length || 0} Questions
          </span>
        </div>

        <div className="space-y-4">
          {result.answers?.map((a, idx) => {
            const delayMs = idx * 45;
            const isIncorrect = a.is_correct === false;
            const isPending = a.pending_manual_review;

            // Color-coded left-border treatment:
            // forest for correct, ember for incorrect, grape for pending review
            let borderTreatment = 'border-l-4 border-forest';
            let statusBadge = (
              <span className="pill pill-forest text-[10px] font-semibold">
                ✓ Correct
              </span>
            );

            if (isIncorrect) {
              borderTreatment = 'border-l-4 border-ember';
              statusBadge = (
                <span className="pill pill-ember text-[10px] font-semibold">
                  ✗ Incorrect
                </span>
              );
            } else if (isPending) {
              borderTreatment = 'border-l-4 border-grape';
              statusBadge = (
                <span className="pill pill-grape text-[10px] font-semibold">
                  Pending Review
                </span>
              );
            }

            return (
              <div
                key={a.question_id || idx}
                style={{ animationDelay: `${delayMs}ms` }}
                className={`animate-card-enter bg-surface border border-border ${borderTreatment} rounded-card p-5 sm:p-6 shadow-card space-y-3.5`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs bg-bg border border-border px-2 py-0.5 rounded-sm">
                      Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </span>
                    <span className="pill pill-muted text-[10px]">
                      {a.question_type}
                    </span>
                    {statusBadge}
                  </div>

                  <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-2.5 py-0.5 rounded-pill">
                    {a.marks_awarded !== null ? a.marks_awarded : '—'} / {a.max_marks} Marks
                  </span>
                </div>

                {/* Question prompt */}
                <p className="font-body text-sm sm:text-base font-medium text-ink leading-relaxed">
                  {a.question_text}
                </p>

                {/* Student's recorded answer */}
                <div className="p-3.5 rounded-card bg-bg border border-border/80 text-xs space-y-1">
                  <span className="font-mono uppercase text-[10px] tracking-wider text-ink/50 block">
                    Your Response:
                  </span>
                  <div className="font-mono text-ink font-semibold whitespace-pre-wrap">
                    {a.student_response ? (
                      a.student_response
                    ) : (
                      <em className="text-ink/40 font-normal">No response submitted</em>
                    )}
                  </div>
                </div>

                {/* Correct solution reference if available */}
                {a.correct_answer && (
                  <div className="p-3.5 rounded-card bg-forest/5 border border-forest/20 text-xs space-y-1">
                    <span className="font-mono uppercase text-[10px] tracking-wider text-forest font-semibold block">
                      Official Reference Answer:
                    </span>
                    <div className="font-mono text-forest font-medium">
                      {a.correct_answer}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {(!result.answers || result.answers.length === 0) && (
            <div className="bg-surface border-2 border-dashed border-border rounded-card p-10 text-center text-xs text-ink/50">
              No individual question breakdown records stored for this attempt.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ResultPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <ResultPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <ResultPageTablet key="tablet" />;
  }
  return <ResultPageDesktop key="desktop" />;
};

