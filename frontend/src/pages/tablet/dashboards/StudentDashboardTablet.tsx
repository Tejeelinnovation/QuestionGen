import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { deliveriesApi } from '../../../api/deliveries';
import type { Delivery } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';

export const StudentDashboardTablet: React.FC = () => {
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
          err.response?.data?.detail || 'Failed to load assigned tests and deliveries.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeliveries();
  }, []);

  const completedCount = deliveries.filter(
    (d) => d.my_attempt && (d.my_attempt.status === 'SUBMITTED' || d.my_attempt.status === 'EVALUATED')
  ).length;

  const pendingCount = deliveries.length - completedCount;

  return (
    <div className="space-y-8 font-body">
      {/* ── Top Header ── */}
      <div className="border-b border-border pb-5 space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Student Testing Portal • Tablet
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Assigned Assessments
        </h1>
        <p className="font-body text-ink/70 text-sm max-w-xl">
          Track upcoming and submitted examination papers assigned to your student profile.
        </p>
      </div>

      {isLoading && (
        <div className="p-8 text-center bg-surface border border-border rounded-card text-ink/60 font-medium">
          Loading assigned assessments...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && deliveries.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-card p-10 text-center space-y-2">
          <span className="pill pill-forest text-[10px]">Queue Clear</span>
          <h3 className="font-heading font-bold text-lg text-ink">No Assessments Assigned</h3>
          <p className="text-xs text-ink/65 max-w-sm mx-auto">
            When tests are scheduled, they will appear here ready for examination.
          </p>
        </div>
      )}

      {!isLoading && !errorMessage && deliveries.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-lg text-ink">
              Available Test Deliveries
            </h2>
            <span className="font-mono text-xs text-ink/60 bg-surface px-3 py-1 rounded-pill border border-border">
              {deliveries.length} Total
            </span>
          </div>

          {/* ── 2-Column Bento Reflow for Delivery Cards ── */}
          <div className="grid grid-cols-2 gap-4">
            {deliveries.map((d, index) => {
              const myAttempt = d.my_attempt;
              const hasSubmitted = myAttempt && (myAttempt.status === 'SUBMITTED' || myAttempt.status === 'EVALUATED');
              const isInProgress = myAttempt && myAttempt.status === 'IN_PROGRESS';

              let statusPill: React.ReactNode;
              if (myAttempt?.status === 'EVALUATED') {
                statusPill = (
                  <span className="pill pill-forest text-[10px]">
                    ✓ Evaluated ({myAttempt.score}/{myAttempt.max_score})
                  </span>
                );
              } else if (myAttempt?.status === 'SUBMITTED') {
                statusPill = (
                  <span className="pill pill-forest text-[10px]">
                    ✓ Submitted
                  </span>
                );
              } else if (isInProgress) {
                statusPill = (
                  <span className="pill pill-ember text-[10px]">
                    In Progress
                  </span>
                );
              } else if (d.mode === 'ONLINE') {
                statusPill = (
                  <span className="pill pill-grape text-[10px]">
                    Ready to Attempt
                  </span>
                );
              } else {
                statusPill = (
                  <span className="pill pill-muted text-[10px]">
                    In-Person / Print
                  </span>
                );
              }

              return (
                <div
                  key={d.id}
                  style={getStaggerDelay(index)}
                  className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between space-y-4 ${MOTION.touch.card.className}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink/50">
                        Delivery #{d.id}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`pill text-[10px] ${d.mode === 'ONLINE' ? 'pill-lime' : 'pill-muted'}`}>
                          {d.mode}
                        </span>
                        {statusPill}
                      </div>
                    </div>

                    <h3 className="font-heading font-bold text-lg text-ink leading-snug line-clamp-2">
                      {d.paper_title || `Delivery Session #${d.id}`}
                    </h3>

                    <div className="text-xs text-ink/65 font-mono">
                      {d.available_from ? new Date(d.available_from).toLocaleDateString() : 'Now'}
                      {' - '}
                      {d.available_until ? new Date(d.available_until).toLocaleDateString() : 'No deadline'}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex flex-wrap items-center gap-2">
                    {hasSubmitted ? (
                      <Link
                        to={`/attempts/${myAttempt.id}/result`}
                        id={`view-result-btn-${d.id}`}
                        className="px-4 py-2.5 rounded-pill bg-grape text-white font-heading font-semibold text-xs hover:bg-grape/90 transition-all shadow-sm min-h-[44px] flex items-center justify-center"
                      >
                        View Result →
                      </Link>
                    ) : isInProgress ? (
                      <Link
                        to={`/deliveries/${d.id}/attempt`}
                        className="px-4 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 shadow-sm min-h-[44px] flex items-center justify-center"
                      >
                        Resume Assessment →
                      </Link>
                    ) : (
                      <Link
                        to={`/deliveries/${d.id}/attempt`}
                        className="px-4 py-2.5 rounded-pill bg-forest text-white hover:bg-forest/90 shadow-sm font-heading font-semibold text-xs transition-all min-h-[44px] flex items-center justify-center"
                      >
                        Start Assessment →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Academic Records Card */}
      <section className="bg-surface border border-border rounded-card p-6 shadow-card space-y-2">
        <div className="flex items-center gap-2">
          <span className="pill pill-forest text-[10px]">Academic Records</span>
          <h2 className="font-heading font-bold text-base text-ink">
            Assessment Results Archive
          </h2>
        </div>
        <p className="text-xs text-ink/70 leading-relaxed">
          Individual evaluation reports and scoring feedback are issued immediately upon online test submission. Historical cards expand as you complete scheduled terms.
        </p>
      </section>
    </div>
  );
};
