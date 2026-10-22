import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../../api/attempts';
import { useAuth } from '../../../auth/AuthContext';
import type { DeliveryResultsRoster, DeliveryRosterAttempt } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { ChevronRight, ArrowLeft, FileSpreadsheet } from 'lucide-react';

export const ResultsRosterPageMobile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);
  const { dashboardPath } = useAuth();

  const [roster, setRoster] = useState<DeliveryResultsRoster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gradebook export configuration
  const [sortBy, setSortBy] = useState<'roll_number' | 'name' | 'score'>('roll_number');
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExportGradebook = async () => {
    try {
      setIsExporting(true);
      await attemptsApi.exportGradebook(deliveryId, sortBy);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to export gradebook spreadsheet.');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (deliveryId) {
      fetchRoster();
    }
  }, [deliveryId]);

  if (isLoading) {
    return (
      <div className="py-20 text-center text-xs text-ink/60 font-body">
        Loading test delivery results roster...
      </div>
    );
  }

  if (errorMessage || !roster) {
    return (
      <div className="space-y-4 font-body py-6">
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage || 'Roster not found.'}
        </div>
        <Link
          to={dashboardPath}
          className="w-full py-3 px-4 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold flex items-center justify-center"
        >
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  const submissions: DeliveryRosterAttempt[] = roster.attempts || [];
  const submittedCount = submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'EVALUATED').length;
  const gradedCount = submissions.filter((s) => s.status === 'EVALUATED').length;

  return (
    <div className="space-y-4 font-body pb-12">
      {/* Top back link and refresh */}
      <div className="flex items-center justify-between">
        <Link
          to={dashboardPath}
          className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-forest hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>

        <button
          onClick={fetchRoster}
          disabled={isLoading}
          className="text-xs text-ink/70 font-heading font-medium hover:text-ink cursor-pointer"
        >
          Refresh ↻
        </button>
      </div>

      {/* ── Headline Summary Block ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="space-y-0.5">
          <span className="pill pill-forest text-[10px] py-0.5 px-2">
            Delivery #{roster.delivery_id} Roster
          </span>
          <h1 className="font-heading font-bold text-lg text-ink">
            {roster.paper_title}
          </h1>
          <div className="text-xs text-ink/60 font-mono">
            Version {roster.version_label}
          </div>
        </div>

        {/* Condensed headline stats */}
        <div className="flex items-baseline justify-between pt-2 border-t border-border/50">
          <div className="flex items-baseline gap-1.5">
            <span className="font-heading font-bold text-4xl text-forest tracking-tight">
              {submittedCount}
            </span>
            <span className="text-xs text-ink/70 font-heading font-semibold">
              of {submissions.length} Submitted
            </span>
          </div>
          <span className="pill pill-ember text-xs">
            {gradedCount} Evaluated
          </span>
        </div>
      </div>

      {/* ── Mobile Export Gradebook Card ── */}
      <div className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-heading font-bold text-ink">Classroom Gradebook</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-[11px] font-heading font-semibold bg-surface-muted border border-border rounded-pill px-2.5 py-1 text-ink focus:outline-none cursor-pointer"
          >
            <option value="roll_number">By Roll No.</option>
            <option value="name">By Name (A-Z)</option>
            <option value="score">By Score (Rank)</option>
          </select>
        </div>
        <button
          onClick={handleExportGradebook}
          disabled={isExporting}
          id="mobile-export-gradebook-btn"
          className="w-full py-2.5 px-4 rounded-pill border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-heading font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xs disabled:opacity-50 min-h-[42px] cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{isExporting ? 'Generating Excel...' : 'Download Gradebook (.xlsx)'}</span>
        </button>
      </div>

      {/* ── Single-Column Student Submissions Feed ── */}
      <div className="space-y-2.5">
        <div className="text-xs font-mono text-ink/60 px-1">
          STUDENT SUBMISSIONS ({submissions.length})
        </div>

        {submissions.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No students assigned to this delivery.
          </div>
        ) : (
          submissions.map((item, idx) => {
            const hasAttempt = !!item.attempt_id;
            const isEvaluated = item.status === 'EVALUATED';
            const isSubmitted = item.status === 'SUBMITTED';

            return (
              <div
                key={item.student_id}
                style={getStaggerDelay(idx, true)}
                className={`animate-card-enter p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5 ${MOTION.touch.card.className}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-heading font-bold text-sm text-ink block">
                      {item.student_username}
                    </span>
                    <span className="text-[11px] font-mono text-ink/50">
                      ID #{item.student_id}
                    </span>
                  </div>

                  <span
                    className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
                      isEvaluated
                        ? 'pill-forest'
                        : isSubmitted
                        ? 'pill-ember'
                        : 'pill-muted'
                    }`}
                  >
                    {item.status?.replace('_', ' ') || 'NOT STARTED'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                  {hasAttempt && item.score !== null && item.score !== undefined ? (
                    <span className="font-mono text-ink font-semibold">
                      Score: {item.score} / {item.max_score || roster.total_marks || 0}
                    </span>
                  ) : (
                    <span className="text-ink/40 text-[11px] font-mono">
                      {item.submitted_at ? 'Submitted' : 'Pending start'}
                    </span>
                  )}

                  {hasAttempt ? (
                    <Link
                      to={`/attempts/${item.attempt_id}/grade`}
                      className="px-3 py-1.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-transform flex items-center gap-1 min-h-[36px]"
                    >
                      <span>{isEvaluated ? 'Review Grade' : 'Grade Attempt'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <span className="text-ink/40 text-[11px] italic">
                      No attempt yet
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
