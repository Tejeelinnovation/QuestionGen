import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { deliveriesApi } from '../../api/deliveries';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { StudentDashboardTablet } from '../tablet/dashboards/StudentDashboardTablet';
import { StudentDashboardMobile } from '../mobile/dashboards/StudentDashboardMobile';
import { AnimatedCard } from '../../components/ui/animated-card';
import { SkeletonDeliveriesList } from '../../components/ui/skeleton';
import type { Delivery } from '../../types';

const StudentDashboardDesktop: React.FC = () => {
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
    <div className="space-y-10">
      {/* ── Top Typographic Headline with embedded stats ── */}
      <div className="border-b border-border pb-6 space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Student Testing Portal
        </div>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
          Assigned Assessments Desk
        </h1>
        <p className="font-body text-ink/75 text-base max-w-2xl leading-relaxed">
          You currently have{' '}
          <span className="font-heading font-bold text-forest text-lg underline decoration-forest/40 underline-offset-2">
            {pendingCount} test{pendingCount === 1 ? '' : 's'} ready for examination
          </span>{' '}
          and{' '}
          <span className="font-heading font-bold text-grape text-lg underline decoration-grape/40 underline-offset-2">
            {completedCount} submitted attempt{completedCount === 1 ? '' : 's'}
          </span>.
        </p>
      </div>

      {isLoading && (
        <SkeletonDeliveriesList count={3} />
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && deliveries.length === 0 && (
        <div className="bg-surface border-2 border-dashed border-border rounded-lg p-12 text-center space-y-3">
          <span className="pill pill-forest text-xs">Queue Clear</span>
          <h3 className="font-heading font-bold text-xl text-ink">No Assessments Assigned</h3>
          <p className="text-xs text-ink/70 max-w-md mx-auto">
            When your instructors schedule an online or proctored test session, it will appear right here with full access controls.
          </p>
        </div>
      )}

      {!isLoading && !errorMessage && deliveries.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-xl text-ink">
              Available Test Deliveries
            </h2>
            <span className="font-mono text-xs text-ink/60 bg-surface px-3 py-1 rounded-pill border border-border">
              {deliveries.length} Total Deliveries
            </span>
          </div>

          {/* Staggered AnimatedCards for deliveries */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deliveries.map((d, index) => {
              const myAttempt = d.my_attempt;
              const hasSubmitted = myAttempt && (myAttempt.status === 'SUBMITTED' || myAttempt.status === 'EVALUATED');
              const isInProgress = myAttempt && myAttempt.status === 'IN_PROGRESS';

              // Status badges: Forest for evaluated/submitted, Ember for in progress, Grape for ready
              let statusPill: React.ReactNode;
              if (myAttempt?.status === 'EVALUATED') {
                statusPill = (
                  <span className="pill pill-forest">
                    ✓ Evaluated ({myAttempt.score}/{myAttempt.max_score})
                  </span>
                );
              } else if (myAttempt?.status === 'SUBMITTED') {
                statusPill = (
                  <span className="pill pill-forest">
                    ✓ Submitted
                  </span>
                );
              } else if (isInProgress) {
                statusPill = (
                  <span className="pill pill-ember">
                    In Progress
                  </span>
                );
              } else if (d.mode === 'ONLINE') {
                statusPill = (
                  <span className="pill pill-grape">
                    Ready to Attempt
                  </span>
                );
              } else {
                statusPill = (
                  <span className="pill pill-muted">
                    In-Person / Print
                  </span>
                );
              }

              return (
                <AnimatedCard
                  key={d.id}
                  staggerIndex={index}
                  hoverAccent={hasSubmitted ? 'forest' : isInProgress ? 'ember' : 'grape'}
                  className="p-6 flex flex-col justify-between min-h-[250px] shadow-card border border-border"
                >
                  <div className="space-y-3.5">
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

                    <h3 className="font-heading font-bold text-xl text-ink leading-snug">
                      {d.paper_title || `Delivery Session #${d.id}`}
                    </h3>

                    <div className="text-xs text-ink/65 space-y-1 pt-1">
                      <div className="font-mono text-[11px] text-ink/70">
                        {d.available_from ? new Date(d.available_from).toLocaleDateString() : 'Now'}
                        {' - '}
                        {d.available_until ? new Date(d.available_until).toLocaleDateString() : 'No deadline'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-border/70 flex flex-wrap items-center gap-2">
                    {hasSubmitted ? (
                      <Link
                        to={`/attempts/${myAttempt.id}/result`}
                        id={`view-result-btn-${d.id}`}
                        className="px-5 py-2 rounded-pill bg-grape text-white font-heading font-semibold text-xs hover:bg-grape/90 transition-all shadow-sm flex items-center gap-1.5"
                      >
                        View Result →
                      </Link>
                    ) : isInProgress ? (
                      <Link
                        to={`/deliveries/${d.id}/attempt`}
                        className="px-4 py-2 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 shadow-sm"
                      >
                        Resume Assessment →
                      </Link>
                    ) : (
                      <Link
                        to={`/deliveries/${d.id}/attempt`}
                        className="px-4 py-2 rounded-pill bg-forest text-white hover:bg-forest/90 shadow-sm font-heading font-semibold text-xs transition-all"
                      >
                        Start Assessment →
                      </Link>
                    )}
                  </div>
                </AnimatedCard>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Asymmetric Bottom Review Panel ── */}
      <section className="bg-surface border border-border rounded-lg p-6 sm:p-8 shadow-card space-y-3">
        <div className="flex items-center gap-2">
          <span className="pill pill-forest text-[10px]">Academic Records</span>
          <h2 className="font-heading font-bold text-lg text-ink">
            Assessment Results & Review Archive
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-ink/75 leading-relaxed max-w-3xl">
          Individual evaluation reports and scoring feedback are issued immediately upon online test submission.
          Historical score cards, answer sheet reviews, and class performance distribution will expand automatically as you complete scheduled terms.
        </p>
      </section>
    </div>
  );
};

export const StudentDashboard: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <StudentDashboardMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <StudentDashboardTablet key="tablet" />;
  }
  return <StudentDashboardDesktop key="desktop" />;
};
