import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import type { StudentAttemptResult } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ResultPageTablet } from '../tablet/attempts/ResultPageTablet';
import { ResultPageMobile } from '../mobile/attempts/ResultPageMobile';
import { getStaggerDelay } from '../../lib/motion';

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
  const scoreNum = Number(result.score) || 0;
  const maxScoreNum = Number(result.max_score) || 0;
  const percentage =
    maxScoreNum > 0 ? ((scoreNum / maxScoreNum) * 100).toFixed(1) : '0.0';

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
            Submitted on {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : '-'}
          </p>
        </div>

        <Link
          to="/dashboard/student"
          className="text-xs font-heading font-semibold text-ink/70 hover:text-ink px-4 py-2 rounded-pill border border-border bg-surface hover:bg-surface-muted transition-colors self-start sm:self-auto"
        >
          ← Student Portal
        </Link>
      </div>

      {/* ── MAIN CONTENT: EVALUATED VS UNDER EVALUATION ── */}
      {!isEvaluated ? (
        <div className="bg-surface border border-amber-500/30 rounded-card p-8 shadow-card text-center space-y-5 animate-card-enter">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center text-3xl">
            ⏳
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <span className="pill pill-ember text-xs font-semibold">
              Evaluation In Progress
            </span>
            <h2 className="font-heading font-bold text-2xl text-ink">
              Assessment Submitted Successfully
            </h2>
            <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
              Your responses have been securely recorded and submitted to your teacher.
              To ensure fair grading across all questions, your scores and official solutions will be unlocked once your teacher finishes marking.
            </p>
          </div>

          <div className="pt-4 border-t border-border flex justify-center gap-3">
            <Link
              to="/dashboard/student"
              className="px-6 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-all shadow-sm"
            >
              Back to Student Portal
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── SCORE AS VISUAL HERO (BOLD SPACE GROTESK TYPOGRAPHY) ── */}
          <div className="bg-surface border border-border rounded-card p-7 sm:p-8 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50">
                Total Assessment Score
              </div>
              <div className="flex items-baseline gap-2" id="result-score-display">
                <span className="font-heading font-bold text-5xl sm:text-6xl text-forest tracking-tight">
                  {scoreNum % 1 === 0 ? scoreNum : scoreNum.toFixed(1)}
                </span>
                <span className="font-heading font-normal text-2xl text-ink/40">
                  / {maxScoreNum}
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
                <span className="pill text-xs font-semibold pill-forest">
                  Evaluated
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
                  Itemized breakdown of responses, points earned, and official solutions.
                </p>
              </div>
              <span className="font-mono text-xs text-ink/60 bg-bg px-3 py-1 rounded-pill border border-border">
                {result.answers?.length || 0} Questions
              </span>
            </div>

            <div className="space-y-3">
              {result.answers?.map((a, idx) => {
                let borderClass = 'border-l-border';
                let pillText = 'Review Pending';
                let pillClass = 'pill-muted';

                if (a.is_correct === true) {
                  borderClass = 'border-l-forest';
                  pillText = 'Correct';
                  pillClass = 'pill-forest';
                } else if (a.is_correct === false) {
                  borderClass = 'border-l-ember';
                  pillText = 'Incorrect';
                  pillClass = 'pill-ember';
                } else if (a.pending_manual_review) {
                  borderClass = 'border-l-grape';
                  pillText = 'Manual Review';
                  pillClass = 'pill-grape';
                }

                return (
                  <div
                    key={a.question_id || idx}
                    style={getStaggerDelay(idx)}
                    className={`animate-card-enter bg-surface border border-border border-l-4 ${borderClass} rounded-card p-5 sm:p-6 shadow-card space-y-3`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-bg border border-border px-2 py-0.5 rounded-sm text-ink">
                          Q{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                        </span>
                        <span className="pill pill-muted text-[10px]">
                          {a.question_type}
                        </span>
                        <span className={`pill text-[10px] ${pillClass}`}>
                          {pillText}
                        </span>
                      </div>

                      <div className="font-mono text-xs font-semibold text-ink">
                        {a.marks_awarded !== null ? a.marks_awarded : '-'} / {a.max_marks} Marks
                      </div>
                    </div>

                    <p className="font-body text-sm font-medium text-ink leading-relaxed">
                      {a.question_text}
                    </p>

                    <div className="p-3 rounded-card bg-bg border border-border text-xs space-y-1">
                      <span className="font-mono uppercase text-[10px] tracking-wider text-ink/50 font-semibold block">
                        Your Submitted Response:
                      </span>
                      <div className="font-body text-ink">
                        {a.student_response ? (
                          <span>{a.student_response}</span>
                        ) : (
                          <span className="italic text-ink/40">No response provided</span>
                        )}
                      </div>
                    </div>

                    {a.correct_answer && (
                      <div className="p-3 rounded-card bg-forest/5 border border-forest/20 text-xs space-y-1">
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
        </>
      )}
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

