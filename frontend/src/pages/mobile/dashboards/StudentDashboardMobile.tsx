import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { deliveriesApi } from '../../../api/deliveries';
import type { Delivery } from '../../../types';
import { BookOpen, Clock, ArrowRight, Award } from 'lucide-react';

export const StudentDashboardMobile: React.FC = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeliveries = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await deliveriesApi.getDeliveries();
        setDeliveries(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load assigned tests.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeliveries();
  }, []);

  const completedCount = deliveries.filter((d) =>
    sessionStorage.getItem(`delivery_${d.id}_attempt`)
  ).length;

  const pendingCount = deliveries.length - completedCount;

  return (
    <div className="space-y-5 font-body">
      {/* ── Top Header ── */}
      <div className="space-y-1.5 border-b border-border pb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-lime text-ink">
          <BookOpen className="w-3 h-3 text-forest" />
          Student Testing Desk
        </div>
        <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
          Assigned Assessments
        </h1>
        <p className="text-xs text-ink/70">
          Complete your online examinations and review instant test score reports.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── Prominent Headline Stat Block ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-4xl text-forest tracking-tight">
              {pendingCount}
            </span>
            <span className="font-heading font-semibold text-sm text-ink/80">
              Assessment{pendingCount === 1 ? '' : 's'} Ready
            </span>
          </div>
          <span className="pill pill-lime text-xs">
            {completedCount} Completed
          </span>
        </div>

        <div className="pt-2 border-t border-border/60 text-xs text-ink/60">
          Total Assigned Tests: {deliveries.length}
        </div>
      </div>

      {/* ── Single-Column Feed of Assessments ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>YOUR EXAMINATIONS ({deliveries.length})</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-ink/50 bg-surface border border-border rounded-card">
            Loading assigned tests...
          </div>
        ) : deliveries.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No tests assigned to you at this time. Check back later!
          </div>
        ) : (
          deliveries.map((d) => {
            const cachedAttemptId = sessionStorage.getItem(`delivery_${d.id}_attempt`);
            const isCompleted = !!cachedAttemptId;

            return (
              <div
                key={d.id}
                className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="font-heading font-bold text-sm text-ink">
                      {d.paper_title || `Assessment #${d.id}`}
                    </h3>
                    <div className="text-[11px] text-ink/60 font-mono">
                      Version: {d.version_label || 'v1.0'} • Mode: {d.mode}
                    </div>
                  </div>
                  <span
                    className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
                      isCompleted ? 'pill-forest' : 'pill-ember'
                    }`}
                  >
                    {isCompleted ? 'Completed' : 'Ready to Take'}
                  </span>
                </div>

                {d.available_until && (
                  <div className="text-[11px] text-ink/60 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-ink/40" />
                    <span>Due: {new Date(d.available_until).toLocaleDateString()}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-border/50">
                  {isCompleted ? (
                    <Link
                      to={`/attempts/${cachedAttemptId}/result`}
                      className="w-full py-2.5 px-4 rounded-pill border border-border bg-surface-muted text-forest font-heading font-semibold text-xs hover:bg-forest hover:text-white active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Review Score & Feedback</span>
                    </Link>
                  ) : (
                    <Link
                      to={`/deliveries/${d.id}/attempt`}
                      id={`start-test-btn-${d.id}`}
                      className="w-full py-3 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[48px] shadow-xs"
                    >
                      <span>Start Assessment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
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
