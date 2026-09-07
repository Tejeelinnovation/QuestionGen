import React from 'react';
import { Link } from 'react-router-dom';

export type WorkflowStep = 'setup' | 'configure' | 'review' | 'version' | 'deliver' | 'print';

interface StepDef {
  key: WorkflowStep;
  number: string;
  label: string;
}

const STEPS: StepDef[] = [
  { key: 'setup', number: '01', label: 'Setup' },
  { key: 'configure', number: '02', label: 'Configure' },
  { key: 'review', number: '03', label: 'Review' },
  { key: 'version', number: '04', label: 'Version' },
  { key: 'deliver', number: '05', label: 'Deliver' },
  { key: 'print', number: '06', label: 'Print' },
];

interface PaperWorkflowNavTabletProps {
  currentStep: WorkflowStep;
  paperId?: number;
  paperTitle?: string;
  chapterTitle?: string;
  versionId?: number;
  versionLabel?: string;
}

export const PaperWorkflowNavTablet: React.FC<PaperWorkflowNavTabletProps> = ({
  currentStep,
  paperId,
  paperTitle,
  chapterTitle,
  versionId,
  versionLabel,
}) => {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  const getStepLink = (step: StepDef, index: number): string | null => {
    if (index > currentIndex) return null;
    if (step.key === 'setup') return '/papers/new';
    if (!paperId) return null;
    if (step.key === 'configure') return `/papers/${paperId}/configure`;
    if (step.key === 'review') return `/papers/${paperId}/review`;
    if (step.key === 'version') {
      return versionId
        ? `/papers/${paperId}/versions/${versionId}`
        : `/papers/${paperId}`;
    }
    if (step.key === 'deliver' && versionId) {
      return `/papers/${paperId}/versions/${versionId}/deliver`;
    }
    if (step.key === 'print' && versionId) {
      return `/papers/${paperId}/versions/${versionId}/print`;
    }
    return null;
  };

  return (
    <div className="space-y-3 pb-4 border-b border-border font-body">
      {/* Top Context Row */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="pill pill-forest text-[10px] py-0.5 px-2 font-mono shrink-0">
            Tablet Studio
          </span>
          {paperTitle && (
            <span className="font-heading font-bold text-ink truncate text-xs">
              {paperTitle}
              {chapterTitle && (
                <span className="font-normal text-ink/50 ml-1">({chapterTitle})</span>
              )}
            </span>
          )}
          {versionLabel && (
            <span className="pill pill-lime text-[10px] shrink-0">
              Ver. {versionLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {paperId && (
            <Link
              to={`/papers/${paperId}`}
              className="text-xs font-heading font-semibold text-forest hover:underline"
            >
              All Versions →
            </Link>
          )}
        </div>
      </div>

      {/* Touch-First Step Progression Ribbon */}
      <div className="overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
        <div className="flex items-center gap-2 min-w-max">
          {STEPS.map((step, idx) => {
            const isActive = step.key === currentStep;
            const isCompleted = idx < currentIndex;
            const linkHref = getStepLink(step, idx);

            const content = (
              <div
                className={`flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-heading font-semibold transition-all min-h-[40px] ${
                  isActive
                    ? 'bg-forest text-white shadow-sm'
                    : isCompleted
                    ? 'bg-surface-muted text-ink border border-border'
                    : 'text-ink/40 border border-border/50 bg-bg'
                }`}
              >
                <span
                  className={`font-mono text-[11px] ${
                    isActive ? 'text-lime' : isCompleted ? 'text-forest' : 'text-ink/30'
                  }`}
                >
                  {step.number}
                </span>
                <span>{step.label}</span>
              </div>
            );

            return (
              <React.Fragment key={step.key}>
                {linkHref && !isActive ? (
                  <Link to={linkHref} className="cursor-pointer active:scale-95 transition-transform">
                    {content}
                  </Link>
                ) : (
                  <div>{content}</div>
                )}
                {idx < STEPS.length - 1 && (
                  <span className="text-border text-xs font-bold">•</span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
