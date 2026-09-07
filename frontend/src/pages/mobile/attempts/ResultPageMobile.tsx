import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import type { StudentAttemptResult } from '../../../types';
import { Clock, ArrowLeft } from 'lucide-react';

export const ResultPageMobile: React.FC = () => {
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
          err.response?.data?.detail || 'Failed to load test attempt results.'
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
      <div className="py-20 text-center text-xs text-ink/60 font-body">
        Compiling assessment evaluation report...
      </div>
    );
  }

  if (errorMessage || !result) {
    return (
      <div className="space-y-4 font-body py-6">
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage || 'Result report not found.'}
        </div>
        <Link
          to="/dashboard/student"
          className="w-full py-3 px-4 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold flex items-center justify-center"
        >
          ← Return to Student Portal
        </Link>
      </div>
    );
  }

  const isEvaluated = result.status === 'EVALUATED';
  const percentage =
    result.max_score > 0
      ? Math.round((result.score / result.max_score) * 100)
      : 0;

  return (
    <div className="space-y-4 font-body">
      {/* Top back link */}
      <Link
        to="/dashboard/student"
        className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-forest hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Student Portal</span>
      </Link>

      {/* ── Prominent Single Headline Score Block ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <span className="pill pill-forest text-[10px] py-0.5 px-2">
              Assessment Summary
            </span>
            <h1 className="font-heading font-bold text-lg text-ink">
              {result.paper_title || `Assessment #${result.id}`}
            </h1>
          </div>
          <span
            className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
              isEvaluated ? 'pill-forest' : 'pill-ember'
            }`}
          >
            {isEvaluated ? 'Graded & Evaluated' : 'Awaiting Teacher Grade'}
          </span>
        </div>

        {isEvaluated ? (
          <div className="flex items-baseline justify-between pt-2 border-t border-border/50">
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading font-bold text-4xl text-forest tracking-tight">
                {result.score}
              </span>
              <span className="font-mono text-sm text-ink/60">
                / {result.max_score} Marks
              </span>
            </div>
            <div className="text-right">
              <span className="font-heading font-bold text-2xl text-ink">
                {percentage}%
              </span>
              <span className="block text-[10px] text-ink/50 font-mono uppercase">
                Final Score
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-card bg-surface-muted border border-border text-xs text-ink/70 flex items-center gap-2">
            <Clock className="w-4 h-4 text-ember shrink-0" />
            <span>Submitted on {new Date(result.submitted_at).toLocaleDateString()}. Teacher is scoring manual answers.</span>
          </div>
        )}
      </div>

      {/* ── Question-by-Question Breakdown ── */}
      <div className="space-y-3">
        <div className="text-xs font-mono text-ink/60 px-1">
          DETAILED RESPONSES ({result.answers?.length || 0})
        </div>

        {result.answers?.map((ans, idx) => {
          const isCorrect = ans.is_correct;
          const marksAwarded = ans.marks_awarded;

          return (
            <div
              key={ans.question_id || idx}
              className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5"
            >
              {/* Question Header */}
              <div className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                <span className="font-mono font-bold text-forest">Question {idx + 1}</span>
                <div className="flex items-center gap-1.5">
                  {marksAwarded !== null && (
                    <span className="pill pill-muted text-[10px] py-0.5">
                      {marksAwarded} / {ans.max_marks || 1} mks
                    </span>
                  )}
                  {isCorrect !== null && (
                    <span
                      className={`pill text-[10px] py-0.5 px-2 ${
                        isCorrect ? 'pill-forest' : 'pill-ember'
                      }`}
                    >
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  )}
                </div>
              </div>

              {/* Prompt */}
              <p className="text-xs text-ink font-heading font-semibold leading-relaxed">
                {ans.question_text}
              </p>

              {/* Student Response */}
              <div className="p-2.5 rounded-card bg-bg border border-border space-y-1 text-xs">
                <span className="text-[10px] font-mono text-ink/50 uppercase block">
                  Your Answer:
                </span>
                <p className="text-ink font-mono text-[11px] whitespace-pre-wrap">
                  {ans.student_response || '(No response provided)'}
                </p>
              </div>

              {/* Model Answer (if revealed) */}
              {ans.correct_answer && (
                <div className="p-2.5 rounded-card bg-forest/5 border border-forest/20 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-forest uppercase font-bold block">
                    Expected / Model Answer:
                  </span>
                  <p className="text-forest text-[11px] font-mono whitespace-pre-wrap">
                    {ans.correct_answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
