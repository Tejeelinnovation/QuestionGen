import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import type { StudentAttemptResult } from '../../../types';

export const ResultPageTablet: React.FC = () => {
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
      <div className="py-20 text-center text-ink/60 font-body text-base">
        Compiling assessment evaluation report for tablet...
      </div>
    );
  }

  if (errorMessage || !result) {
    return (
      <div className="p-6 space-y-4 font-body">
        {errorMessage && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-5 text-sm font-medium">
            {errorMessage}
          </div>
        )}
        <Link
          to="/dashboard/student"
          className="min-h-[48px] inline-flex items-center text-sm font-heading font-semibold text-forest hover:underline"
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
    <div className="pb-20 font-body space-y-6">
      {/* ── TABLET HEADER ── */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Evaluation Report • Attempt #{result.id}
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
            {result.paper_title || `Assessment #${result.id}`}
          </h1>
          <p className="text-xs text-ink/60 font-mono">
            Submitted on {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : '-'}
          </p>
        </div>

        <Link
          to="/dashboard/student"
          className="min-h-[44px] px-5 inline-flex items-center text-xs sm:text-sm font-heading font-semibold text-ink/80 hover:text-ink rounded-pill border border-border bg-surface hover:bg-surface-muted transition-colors active:scale-95"
        >
          ← Student Portal
        </Link>
      </div>

      {/* ── PENDING REVIEW BANNER (NON-ALARMING GRAPE) ── */}
      {(isSubmitted || pendingQuestionsCount > 0) && (
        <div
          id="pending-review-banner"
          className="rounded-card border border-grape/30 bg-grape/10 p-5 text-ink space-y-1.5 shadow-card animate-card-enter"
        >
          <div className="flex items-center gap-2">
            <span className="pill pill-grape text-xs font-semibold">
              Subjective Evaluation Pending
            </span>
          </div>
          <p className="text-xs sm:text-sm text-ink/80 leading-relaxed pt-0.5">
            Some answers are currently pending manual teacher review. Your objective MCQ score is tabulated below; your final grade will update once your instructor evaluates open-ended responses.
          </p>
        </div>
      )}

      {/* ── 2-COLUMN BENTO SCORE HERO ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Bento: Big Score Display */}
        <div className="md:col-span-7 bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-ink/50">
            Total Assessment Score
          </div>
          <div className="flex items-baseline gap-2.5" id="result-score-display">
            <span className="font-heading font-bold text-5xl sm:text-6xl text-forest tracking-tight">
              {result.score % 1 === 0 ? result.score : result.score.toFixed(1)}
            </span>
            <span className="font-heading font-normal text-2xl text-ink/40">
              / {result.max_score}
            </span>
            <span className="text-xs font-mono font-semibold text-ink/60 pl-1">Marks</span>
          </div>
          <p className="text-xs text-ink/60 font-mono pt-1">
            Calculated from auto-graded and verified teacher scores
          </p>
        </div>

        {/* Right Bento: Percentage & Status Stack */}
        <div className="md:col-span-5 grid grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between">
            <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50">
              Percentage
            </div>
            <div className="font-heading font-bold text-3xl sm:text-4xl text-ink mt-2">
              {percentage}%
            </div>
            <span className="text-[10px] text-ink/40 font-mono">Performance ratio</span>
          </div>

          <div className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between">
            <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50">
              Attempt Status
            </div>
            <div className="mt-2">
              <span
                className={`pill text-xs font-semibold ${
                  isEvaluated ? 'pill-forest' : 'pill-grape'
                }`}
              >
                {isEvaluated ? 'Evaluated' : 'Submitted'}
              </span>
            </div>
            <span className="text-[10px] text-ink/40 font-mono">Current state</span>
          </div>
        </div>
      </div>

      {/* ── QUESTION BREAKDOWN (COLOR-CODED LEFT BORDERS) ── */}
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
            const isIncorrect = a.is_correct === false;
            const isPending = a.pending_manual_review;

            let borderTreatment = 'border-l-4 border-forest';
            let statusBadge = (
              <span className="pill pill-forest text-[11px] font-semibold">
                ✓ Correct
              </span>
            );

            if (isIncorrect) {
              borderTreatment = 'border-l-4 border-ember';
              statusBadge = (
                <span className="pill pill-ember text-[11px] font-semibold">
                  ✗ Incorrect
                </span>
              );
            } else if (isPending) {
              borderTreatment = 'border-l-4 border-grape';
              statusBadge = (
                <span className="pill pill-grape text-[11px] font-semibold">
                  Pending Review
                </span>
              );
            }

            return (
              <div
                key={a.question_id || idx}
                className={`bg-surface border border-border ${borderTreatment} rounded-card p-6 shadow-card space-y-4`}
              >
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-xs bg-bg border border-border px-2.5 py-1 rounded-sm">
                      Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </span>
                    <span className="pill pill-muted text-[11px]">
                      {a.question_type}
                    </span>
                    {statusBadge}
                  </div>

                  <span className="font-mono text-xs font-bold text-forest bg-forest/10 px-3 py-1 rounded-pill">
                    {a.marks_awarded !== null ? a.marks_awarded : '-'} / {a.max_marks} Marks
                  </span>
                </div>

                <p className="font-body text-base font-medium text-ink leading-relaxed">
                  {a.question_text}
                </p>

                <div className="p-4 rounded-card bg-bg border border-border/80 text-sm space-y-1.5">
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

                {a.correct_answer && (
                  <div className="p-4 rounded-card bg-forest/5 border border-forest/20 text-sm space-y-1.5">
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
            <div className="bg-surface border-2 border-dashed border-border rounded-card p-12 text-center text-xs text-ink/50">
              No individual question breakdown records stored for this attempt.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
