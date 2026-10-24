import React from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  radius?: 'sm' | 'card' | 'lg' | 'pill';
}

/**
 * Base Skeleton block with warm dual-tone shimmer.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  radius = 'sm',
  ...props
}) => {
  const radiusClass = {
    sm: 'rounded-sm',
    card: 'rounded-card',
    lg: 'rounded-lg',
    pill: 'rounded-pill',
  }[radius];

  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer ${radiusClass} ${className}`}
      {...props}
    />
  );
};

/**
 * Premium Skeleton for Role Deck cards across breakpoints:
 * - Desktop: 5 asymmetric/fanned cards
 * - Tablet: 2x2 grid
 * - Mobile: 2-column compact chips
 */
export const SkeletonRoleDeck: React.FC = () => {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'mobile') {
    return (
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        <div className="p-3 rounded-card bg-surface border border-border space-y-2">
          <Skeleton className="h-3 w-14" radius="pill" />
          <Skeleton className="h-6 w-10" radius="sm" />
        </div>
        <div className="p-3 rounded-card bg-surface border border-border space-y-2">
          <Skeleton className="h-3 w-14" radius="pill" />
          <Skeleton className="h-6 w-10" radius="sm" />
        </div>
      </div>
    );
  }

  if (breakpoint === 'tablet') {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-40" radius="pill" />
          <Skeleton className="h-3.5 w-24" radius="pill" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between min-h-[160px] space-y-3"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" radius="pill" />
                <Skeleton className="h-7 w-8" radius="sm" />
              </div>
              <Skeleton className="h-5 w-32" radius="sm" />
              <Skeleton className="h-3.5 w-full" radius="sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Desktop (fanned 5 cards)
  return (
    <section className="pt-4 pb-8" aria-hidden="true">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-3.5 w-48" radius="pill" />
        <Skeleton className="h-3 w-40" radius="pill" />
      </div>
      <div className="grid grid-cols-5 gap-3 items-end pt-6">
        {[220, 245, 230, 225, 215].map((height, i) => (
          <div
            key={i}
            style={{ minHeight: `${height}px` }}
            className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-16" radius="pill" />
                <Skeleton className="h-3 w-6" radius="sm" />
              </div>
              <Skeleton className="h-6 w-28" radius="sm" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full" radius="sm" />
                <Skeleton className="h-3 w-4/5" radius="sm" />
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-1.5">
              <Skeleton className="h-8 w-12" radius="sm" />
              <Skeleton className="h-3 w-24" radius="sm" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

/**
 * Premium Table Skeleton for Desktop views (e.g. Super Admin User Directory)
 */
export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div className="w-full space-y-3" aria-hidden="true">
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="py-3.5 px-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-48">
              <Skeleton className="h-3 w-8" radius="sm" />
              <Skeleton className="h-4 w-28" radius="sm" />
            </div>
            <Skeleton className="h-5 w-20" radius="pill" />
            <Skeleton className="h-3 w-16" radius="sm" />
            <Skeleton className="h-5 w-16" radius="sm" />
            <Skeleton className="h-6 w-14" radius="pill" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Device-Aware User Roster Skeleton:
 * - Desktop: Table rows
 * - Tablet: 2-column card grid
 * - Mobile: Stacked feed cards
 */
export const SkeletonRoster: React.FC<{ count?: number }> = ({ count = 6 }) => {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'mobile') {
    return (
      <div className="space-y-2.5" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-32" radius="sm" />
                <Skeleton className="h-3 w-40" radius="sm" />
              </div>
              <Skeleton className="h-4 w-14" radius="pill" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <Skeleton className="h-3 w-24" radius="sm" />
              <Skeleton className="h-6 w-16" radius="pill" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (breakpoint === 'tablet') {
    return (
      <div className="grid grid-cols-2 gap-3.5" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-card p-4 shadow-card space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" radius="pill" />
                <Skeleton className="h-3 w-8" radius="sm" />
              </div>
              <Skeleton className="h-4 w-32" radius="sm" />
              <Skeleton className="h-3 w-28" radius="sm" />
            </div>
            <div className="pt-2 border-t border-border flex justify-end">
              <Skeleton className="h-7 w-28" radius="pill" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Desktop
  return <SkeletonTable rows={count} />;
};

/**
 * Skeleton for Faculty & Teacher cards in School Admin
 */
export const SkeletonFacultyRoster: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-card bg-surface border border-border shadow-xs flex items-center justify-between gap-4"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" radius="pill" />
              <Skeleton className="h-3 w-16" radius="sm" />
            </div>
            <Skeleton className="h-5 w-36" radius="sm" />
            <Skeleton className="h-3 w-28" radius="sm" />
          </div>
          <Skeleton className="h-8 w-28" radius="pill" />
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Student Candidate roster
 */
export const SkeletonStudentGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
  const breakpoint = useBreakpoint();
  const colsClass = breakpoint === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={`grid ${colsClass} gap-3.5`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-card bg-surface border border-border shadow-xs flex flex-col justify-between space-y-3 min-h-[130px]"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" radius="pill" />
              <Skeleton className="h-3 w-12" radius="sm" />
            </div>
            <Skeleton className="h-4 w-28" radius="sm" />
            <Skeleton className="h-3 w-36" radius="sm" />
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <Skeleton className="h-3 w-14" radius="sm" />
            <Skeleton className="h-7 w-24" radius="pill" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Test Deliveries roster
 */
export const SkeletonDeliveriesList: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-card bg-surface border border-border shadow-xs flex items-center justify-between gap-4"
        >
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" radius="sm" />
              <Skeleton className="h-4 w-14" radius="pill" />
              <Skeleton className="h-4 w-12" radius="pill" />
            </div>
            <Skeleton className="h-5 w-48" radius="sm" />
            <Skeleton className="h-3 w-32" radius="sm" />
          </div>
          <Skeleton className="h-8 w-24" radius="pill" />
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Question Paper cards across Teacher Studio (Desktop, Tablet, Mobile)
 */
export const SkeletonPaperGrid: React.FC<{ count?: number }> = ({ count = 3 }) => {
  const breakpoint = useBreakpoint();
  const gridClass =
    breakpoint === 'mobile'
      ? 'grid-cols-1'
      : breakpoint === 'tablet'
      ? 'grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={`grid ${gridClass} gap-5`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between space-y-4 min-h-[170px]"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" radius="sm" />
              <Skeleton className="h-4 w-14" radius="pill" />
            </div>
            <Skeleton className="h-5 w-4/5" radius="sm" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-28" radius="sm" />
            </div>
          </div>
          <div className="pt-3 border-t border-border/70 flex items-center justify-between">
            <Skeleton className="h-3 w-20" radius="sm" />
            <Skeleton className="h-8 w-24" radius="pill" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for compact student roster in Teacher Studio
 */
export const SkeletonCompactList: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="bg-surface border border-border rounded-card p-4 shadow-card divide-y divide-border/60" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="py-2.5 flex items-center justify-between gap-2">
          <div className="space-y-1.5 flex-1 min-w-0">
            <Skeleton className="h-3.5 w-32" radius="sm" />
            <Skeleton className="h-3 w-40" radius="sm" />
          </div>
          <Skeleton className="h-6 w-12 shrink-0" radius="pill" />
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for 4-card Metric Highlights deck (QBM, School Admin, etc.)
 */
export const SkeletonMetricCards: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-card p-4 shadow-card space-y-2.5">
          <Skeleton className="h-3 w-24" radius="pill" />
          <Skeleton className="h-7 w-16" radius="sm" />
          <Skeleton className="h-3 w-20" radius="pill" />
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Question Cards Grid in QBM Explorer (Desktop, Tablet, Mobile)
 */
export const SkeletonQuestionGrid: React.FC<{ count?: number }> = ({ count = 4 }) => {
  const breakpoint = useBreakpoint();
  const gridClass =
    breakpoint === 'mobile'
      ? 'grid-cols-1'
      : 'grid-cols-1 md:grid-cols-2';

  return (
    <div className={`grid ${gridClass} gap-4`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface border border-border rounded-card p-4 shadow-card space-y-3 flex flex-col justify-between"
        >
          <div className="space-y-3">
            {/* Badge tags row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-20" radius="pill" />
                <Skeleton className="h-4 w-12" radius="pill" />
                <Skeleton className="h-4 w-14" radius="pill" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-16" radius="pill" />
                <Skeleton className="h-4 w-16" radius="pill" />
              </div>
            </div>

            {/* Question prompt lines */}
            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-4 w-full" radius="sm" />
              <Skeleton className="h-4 w-5/6" radius="sm" />
              <Skeleton className="h-3.5 w-2/3" radius="sm" />
            </div>

            {/* Hierarchy breadcrumbs */}
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-3 w-16" radius="sm" />
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-24" radius="sm" />
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-20" radius="sm" />
            </div>
          </div>

          {/* Footer action bar */}
          <div className="pt-3 border-t border-border/60 flex items-center justify-between">
            <Skeleton className="h-3 w-28" radius="sm" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-20" radius="pill" />
              <Skeleton className="h-7 w-16" radius="pill" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for DEO Submissions & Review Queue cards
 */
export const SkeletonSubmissionsList: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-card p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" radius="pill" />
              <Skeleton className="h-4 w-16" radius="pill" />
              <Skeleton className="h-4 w-14" radius="pill" />
            </div>
            <Skeleton className="h-4 w-20" radius="pill" />
          </div>
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-full" radius="sm" />
            <Skeleton className="h-4 w-3/4" radius="sm" />
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <Skeleton className="h-3 w-32" radius="sm" />
            <Skeleton className="h-7 w-24" radius="pill" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Validation Audit Timeline drawer
 */
export const SkeletonAuditTimeline: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative space-y-2">
          <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-surface bg-border" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-32" radius="pill" />
            <Skeleton className="h-3 w-20" radius="sm" />
          </div>
          <Skeleton className="h-12 w-full" radius="card" />
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Dataset Ingestion Jobs (Desktop, Tablet, Mobile)
 */
export const SkeletonIngestionList: React.FC<{ count?: number }> = ({ count = 4 }) => {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'mobile') {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4 rounded-xl bg-surface border border-border shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 flex-1 min-w-0">
                <Skeleton className="h-4 w-40" radius="sm" />
                <Skeleton className="h-3 w-28" radius="sm" />
              </div>
              <Skeleton className="h-5 w-16" radius="pill" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20" radius="sm" />
                <Skeleton className="h-3 w-10" radius="sm" />
              </div>
              <Skeleton className="h-2 w-full" radius="pill" />
            </div>
            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <Skeleton className="h-3 w-24" radius="sm" />
              <Skeleton className="h-7 w-20" radius="pill" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Tablet & Desktop (Table / card list)
  return (
    <div className="w-full divide-y divide-border/60" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Skeleton className="w-9 h-9 shrink-0" radius="card" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-4 w-48" radius="sm" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-24" radius="sm" />
                <Skeleton className="h-3 w-16" radius="pill" />
                <Skeleton className="h-3 w-20" radius="sm" />
              </div>
            </div>
          </div>
          <div className="w-36 space-y-1.5 hidden sm:block">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-14" radius="sm" />
              <Skeleton className="h-3 w-8" radius="sm" />
            </div>
            <Skeleton className="h-2 w-full" radius="pill" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20" radius="pill" />
            <Skeleton className="h-7 w-16" radius="pill" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Class Sections & Divisions Grid
 */
export const SkeletonClassSections: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-xl bg-surface border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="w-7 h-7" radius="card" />
              <Skeleton className="h-5 w-24" radius="sm" />
            </div>
            <Skeleton className="h-4 w-12" radius="pill" />
          </div>
          <div className="space-y-2 pt-1 border-t border-border/50">
            <Skeleton className="h-3.5 w-3/4" radius="sm" />
            <Skeleton className="h-3 w-1/2" radius="sm" />
          </div>
          <div className="pt-2 border-t border-border/50 flex justify-end gap-2">
            <Skeleton className="h-6 w-16" radius="pill" />
            <Skeleton className="h-6 w-16" radius="pill" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Study Material Bulk Policy cards inside Modal
 */
export const SkeletonPolicyCards: React.FC = () => {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="p-3.5 rounded-xl border border-border bg-surface space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1">
              <Skeleton className="w-7 h-7" radius="card" />
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" radius="sm" />
                  <Skeleton className="h-4 w-20" radius="pill" />
                </div>
                <Skeleton className="h-3 w-3/4" radius="sm" />
              </div>
            </div>
            <Skeleton className="w-10 h-5" radius="pill" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for Audit Log Viewer table rows
 */
export const SkeletonAuditTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="divide-y divide-border/60" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" radius="sm" />
              <Skeleton className="h-3 w-20" radius="sm" />
            </div>
          </div>
          <Skeleton className="h-5 w-24" radius="pill" />
          <Skeleton className="h-4 w-40" radius="sm" />
          <Skeleton className="h-3 w-20" radius="sm" />
        </div>
      ))}
    </div>
  );
};

/**
 * Full page layout skeleton for route transitions and session loading
 */
export const SkeletonPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] p-4 sm:p-6 max-w-6xl mx-auto space-y-6" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" radius="sm" />
          <Skeleton className="h-4 w-96 max-w-full" radius="sm" />
        </div>
        <Skeleton className="h-9 w-32" radius="pill" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <Skeleton className="h-4 w-24" radius="pill" />
            <Skeleton className="h-8 w-16" radius="sm" />
            <Skeleton className="h-3 w-32" radius="sm" />
          </div>
        ))}
      </div>
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        <Skeleton className="h-5 w-48" radius="sm" />
        <SkeletonTable rows={5} />
      </div>
    </div>
  );
};

/**
 * Skeleton for Live Examination Environment (TestAttemptPage across Desktop, Tablet, Mobile)
 */
export const SkeletonExamEnvironment: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6 font-body" aria-hidden="true">
      {/* Top Examination Status Header */}
      <div className="bg-surface border border-border rounded-card p-4 sm:p-5 shadow-xs flex items-center justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" radius="pill" />
            <Skeleton className="h-4 w-16" radius="pill" />
          </div>
          <Skeleton className="h-6 w-3/4 max-w-md" radius="sm" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-10 w-28" radius="card" />
        </div>
      </div>

      {/* Main Question Card + Options */}
      <div className="bg-surface border border-border rounded-card p-5 sm:p-7 shadow-card space-y-6">
        <div className="flex items-center justify-between border-b border-border/70 pb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-28" radius="pill" />
            <Skeleton className="h-5 w-16" radius="pill" />
          </div>
          <Skeleton className="h-5 w-20" radius="pill" />
        </div>

        {/* Question Prompt */}
        <div className="space-y-2.5 py-2">
          <Skeleton className="h-5 w-full" radius="sm" />
          <Skeleton className="h-5 w-11/12" radius="sm" />
          <Skeleton className="h-5 w-4/5" radius="sm" />
        </div>

        {/* 4 MCQ Option Blocks */}
        <div className="space-y-3 pt-2">
          {[0, 1, 2, 3].map((opt) => (
            <div
              key={opt}
              className="p-3.5 sm:p-4 rounded-card border border-border bg-bg flex items-center gap-3"
            >
              <Skeleton className="w-6 h-6 rounded-full shrink-0" />
              <Skeleton className="h-4 w-3/4" radius="sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="bg-surface border border-border rounded-card p-4 shadow-float flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-24" radius="pill" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" radius="pill" />
          <Skeleton className="h-9 w-32" radius="pill" />
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton for Assessment Scorecard & Results Report (ResultPage)
 */
export const SkeletonScorecard: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6 font-body" aria-hidden="true">
      {/* Top Return link */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-36" radius="sm" />
        <Skeleton className="h-8 w-28" radius="pill" />
      </div>

      {/* Hero Scorecard Banner */}
      <div className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-card flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
        <div className="space-y-2.5 flex-1">
          <Skeleton className="h-4 w-24" radius="pill" />
          <Skeleton className="h-7 w-64 max-w-full" radius="sm" />
          <Skeleton className="h-4 w-48" radius="sm" />
        </div>
        <div className="w-24 h-24 rounded-full border-4 border-border flex items-center justify-center shrink-0">
          <Skeleton className="w-14 h-8" radius="sm" />
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2">
            <Skeleton className="h-3 w-16" radius="pill" />
            <Skeleton className="h-6 w-12" radius="sm" />
          </div>
        ))}
      </div>

      {/* Question Breakdown List */}
      <div className="bg-surface border border-border rounded-card p-5 sm:p-6 shadow-card space-y-4">
        <Skeleton className="h-5 w-48" radius="sm" />
        <div className="divide-y divide-border/60">
          {[0, 1, 2, 3].map((q) => (
            <div key={q} className="py-3.5 flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-3/4" radius="sm" />
                <Skeleton className="h-3 w-1/3" radius="sm" />
              </div>
              <Skeleton className="h-6 w-16" radius="pill" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton for Grading Desk (GradeAttemptPage across Desktop, Tablet, Mobile)
 */
export const SkeletonGradingDesk: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6 font-body" aria-hidden="true">
      {/* Top Nav */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" radius="sm" />
        <Skeleton className="h-4 w-20" radius="sm" />
      </div>

      {/* Candidate Banner */}
      <div className="bg-surface border border-border rounded-card p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" radius="pill" />
            <Skeleton className="h-4 w-20" radius="pill" />
          </div>
          <Skeleton className="h-6 w-56" radius="sm" />
          <Skeleton className="h-3.5 w-40" radius="sm" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-24" radius="card" />
        </div>
      </div>

      {/* Answer Grading Cards */}
      <div className="space-y-4">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="bg-surface border border-border rounded-card p-5 sm:p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <Skeleton className="h-4 w-32" radius="pill" />
              <Skeleton className="h-5 w-20" radius="pill" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" radius="sm" />
              <Skeleton className="h-4 w-4/5" radius="sm" />
            </div>
            <div className="p-3.5 rounded-card bg-bg border border-border space-y-2">
              <Skeleton className="h-3 w-28" radius="pill" />
              <Skeleton className="h-4 w-3/4" radius="sm" />
            </div>
            <div className="pt-2 border-t border-border/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-20" radius="sm" />
                <Skeleton className="h-8 w-24" radius="pill" />
              </div>
              <Skeleton className="h-8 w-28" radius="pill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Skeleton for Question Paper Blueprints, Setup & Version Detail views
 */
export const SkeletonPaperDetail: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-6 font-body" aria-hidden="true">
      {/* Workflow Steps Indicator Bar */}
      <div className="bg-surface border border-border rounded-card p-3 shadow-xs flex items-center justify-between gap-2 overflow-x-auto">
        {[0, 1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2 shrink-0">
            <Skeleton className="w-6 h-6 rounded-full" />
            <Skeleton className="h-3.5 w-20 hidden sm:inline-block" radius="sm" />
          </div>
        ))}
      </div>

      {/* Paper Hero Header */}
      <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-20" radius="pill" />
          <Skeleton className="h-4 w-24" radius="pill" />
          <Skeleton className="h-4 w-16" radius="pill" />
        </div>
        <Skeleton className="h-7 w-3/4 max-w-lg" radius="sm" />
        <Skeleton className="h-4 w-1/2" radius="sm" />
      </div>

      {/* Grid of Version / Question Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((card) => (
          <div key={card} className="bg-surface border border-border rounded-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" radius="pill" />
              <Skeleton className="h-4 w-12" radius="pill" />
            </div>
            <Skeleton className="h-5 w-40" radius="sm" />
            <Skeleton className="h-3.5 w-full" radius="sm" />
            <div className="pt-3 border-t border-border flex justify-between">
              <Skeleton className="h-3 w-20" radius="sm" />
              <Skeleton className="h-7 w-20" radius="pill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};



