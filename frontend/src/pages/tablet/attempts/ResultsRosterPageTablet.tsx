import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import type { DeliveryResultsRoster } from '../../../types';

export const ResultsRosterPageTablet: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);

  const [roster, setRoster] = useState<DeliveryResultsRoster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRoster = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await attemptsApi.getDeliveryResults(deliveryId);
      setRoster(data);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load test delivery results roster.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (deliveryId) {
      fetchRoster();
    }
  }, [deliveryId]);

  if (isLoading) {
    return (
      <div className="py-20 text-center text-ink/60 font-body text-base">
        Loading delivery results roster for tablet...
      </div>
    );
  }

  if (errorMessage || !roster) {
    return (
      <div className="p-6 space-y-4 font-body">
        {errorMessage && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-5 text-sm font-medium">
            {errorMessage}
          </div>
        )}
        <Link
          to="/dashboard/teacher"
          className="min-h-[48px] inline-flex items-center text-sm font-heading font-semibold text-forest hover:underline"
        >
          ← Return to Teacher Dashboard
        </Link>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'EVALUATED':
        return <span className="pill pill-forest text-xs font-semibold">Evaluated</span>;
      case 'SUBMITTED':
        return <span className="pill pill-grape text-xs font-semibold">Submitted</span>;
      case 'IN_PROGRESS':
        return <span className="pill pill-ember text-xs font-semibold">In Progress</span>;
      default:
        return <span className="pill pill-muted text-xs font-semibold">Not Started</span>;
    }
  };

  return (
    <div className="pb-20 font-body space-y-6">
      {/* ── TABLET HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Delivery Results Assessment Hub
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
            {roster.paper_title}
          </h1>
          <div className="flex items-center gap-3 text-xs text-ink/65 font-mono">
            <span>Delivery #{roster.delivery_id}</span>
            <span>•</span>
            <span className="font-bold text-forest">Version {roster.version_label}</span>
            <span>•</span>
            <span>{roster.total_marks} Total Marks</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRoster}
            disabled={isLoading}
            className="min-h-[44px] px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-50 active:scale-95"
          >
            Refresh Roster ↻
          </button>
          <Link
            to="/dashboard/teacher"
            className="min-h-[44px] px-5 py-2 inline-flex items-center text-xs font-heading font-semibold rounded-pill bg-surface-muted border border-border text-ink hover:bg-ink hover:text-white transition-colors active:scale-95"
          >
            ← Teacher Studio
          </Link>
        </div>
      </div>

      {/* ── 2-COLUMN BENTO METRICS REFLOW ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50 mb-1">
            Assigned Candidates
          </div>
          <div className="font-heading font-bold text-3xl text-ink">
            {roster.total_students_assigned}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50 mb-1">
            Attempts Started
          </div>
          <div className="font-heading font-bold text-3xl text-ember">
            {roster.attempts_count}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50 mb-1">
            Submitted Attempts
          </div>
          <div className="font-heading font-bold text-3xl text-grape">
            {roster.submitted_count}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-card p-5 shadow-card">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink/50 mb-1">
            Fully Evaluated
          </div>
          <div className="font-heading font-bold text-3xl text-forest">
            {roster.evaluated_count}
          </div>
        </div>
      </div>

      {/* ── CANDIDATE EXAMINATION ROSTER (TABLET TOUCH CARDS) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Candidate Examination Roster
            </h2>
            <p className="text-xs text-ink/60">
              Select any candidate attempt to grade subjective explanations or review scored responses
            </p>
          </div>
          <span className="font-mono text-xs text-ink/50">
            {roster.attempts.length} {roster.attempts.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        <div className="space-y-3.5">
          {roster.attempts.map((a) => {
            const isEvaluated = a.status === 'EVALUATED';
            const isSubmitted = a.status === 'SUBMITTED';
            const initials = a.student_username.slice(0, 2).toUpperCase();

            return (
              <div
                key={a.attempt_id}
                className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 active:border-forest/70 transition-all"
              >
                {/* Student Info */}
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-bg border border-border flex items-center justify-center font-heading font-bold text-sm text-ink shrink-0">
                    {initials}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-heading font-bold text-base text-ink">
                        {a.student_username}
                      </span>
                      {getStatusBadge(a.status)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-ink/50 font-mono">
                      <span>Attempt #{a.attempt_id}</span>
                      <span>•</span>
                      <span>
                        {a.submitted_at
                          ? `Submitted ${new Date(a.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'In progress'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score & Action Cluster */}
                <div className="flex items-center gap-5 justify-between sm:justify-end border-t sm:border-t-0 border-border/70 pt-3 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-mono uppercase text-ink/40">
                      Score Awarded
                    </div>
                    <div className="font-heading font-bold text-lg text-ink">
                      {a.score !== null && a.score !== undefined ? (
                        <span className="text-forest">
                          {a.score} <span className="text-xs font-normal text-ink/50">/ {a.max_score}</span>
                        </span>
                      ) : (
                        <span className="text-ink/40 font-mono text-sm">— / {a.max_score}</span>
                      )}
                    </div>
                  </div>

                  <Link
                    to={`/attempts/${a.attempt_id}/grade`}
                    id={`grade-attempt-${a.attempt_id}-link`}
                    className={`min-h-[48px] px-6 py-2.5 text-xs font-heading font-semibold rounded-pill transition-all shadow-sm inline-flex items-center gap-2 active:scale-95 ${
                      isSubmitted
                        ? 'bg-forest text-white hover:bg-forest/90'
                        : isEvaluated
                        ? 'bg-surface-muted border border-border text-ink hover:bg-forest hover:text-white'
                        : 'bg-bg border border-border text-ink/70 hover:text-ink'
                    }`}
                  >
                    <span>{isEvaluated ? 'Review Grade' : 'Grade Attempt'}</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {roster.attempts.length === 0 && (
            <div className="bg-surface border-2 border-dashed border-border rounded-card p-12 text-center space-y-3">
              <span className="pill pill-forest text-xs">Waiting for Submissions</span>
              <h3 className="font-heading font-bold text-lg text-ink">
                No Candidate Attempts Started Yet
              </h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto">
                As soon as students log into the portal and begin their assessments, their progress and submissions will populate here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
