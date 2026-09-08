import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';

export type WorkflowStep = 'setup' | 'configure' | 'review' | 'version' | 'deliver' | 'print';

interface StepDef {
  key: WorkflowStep;
  number: string;
  label: string;
  sublabel: string;
}

const STEPS: StepDef[] = [
  { key: 'setup', number: '01', label: 'Setup', sublabel: 'Blueprint' },
  { key: 'configure', number: '02', label: 'Configure', sublabel: 'Constraints' },
  { key: 'review', number: '03', label: 'Review', sublabel: 'Candidate Pool' },
  { key: 'version', number: '04', label: 'Version', sublabel: 'Immutable Snapshot' },
  { key: 'deliver', number: '05', label: 'Deliver', sublabel: 'Assign & Schedule' },
  { key: 'print', number: '06', label: 'Print', sublabel: 'Restrained Layout' },
];

interface PaperWorkflowNavProps {
  currentStep: WorkflowStep;
  paperId?: number;
  paperTitle?: string;
  chapterTitle?: string;
  versionId?: number;
  versionLabel?: string;
}

export const PaperWorkflowNav: React.FC<PaperWorkflowNavProps> = ({
  currentStep,
  paperId,
  paperTitle,
  chapterTitle,
  versionId,
  versionLabel,
}) => {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  const { dashboardPath, role_label } = useAuth();

  const getStepLink = (step: StepDef, index: number): string | null => {
    // Only allow navigating backward to previously established steps
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
    <div className="space-y-4 pb-6 border-b border-border">
      {/* Top utility row: Context & Dashboard link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono uppercase tracking-wider text-ink/50 text-[10px]">
            Examination Studio
          </span>
          <span className="text-border-strong">•</span>
          {paperTitle ? (
            <span className="font-heading font-semibold text-ink flex items-center gap-1.5 truncate max-w-md">
              <span className="w-2 h-2 rounded-full bg-forest shrink-0" />
              {paperTitle}
              {chapterTitle && (
                <span className="font-normal text-ink/60 text-[11px]">
                  ({chapterTitle})
                </span>
              )}
            </span>
          ) : (
            <span className="font-heading font-medium text-ink/70">
              New Question Paper Architecture
            </span>
          )}

          {versionLabel && (
            <span className="pill pill-forest text-[10px] py-0.5 px-2">
              Version {versionLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {paperId && (
            <Link
              to={`/papers/${paperId}`}
              className="font-heading font-medium text-ink/70 hover:text-forest transition-colors"
            >
              Paper Versions →
            </Link>
          )}
          <Link
            to={dashboardPath}
            className="font-heading font-medium text-ink/60 hover:text-ink transition-colors flex items-center gap-1"
          >
            ← {role_label ? `${role_label} Dashboard` : 'Dashboard'}
          </Link>
        </div>
      </div>

      {/* Understated running breadcrumb-as-headline progression bar */}
      <nav aria-label="Workflow Progression" className="pt-1">
        <ol className="flex items-center justify-between gap-1 sm:gap-2">
          {STEPS.map((step, idx) => {
            const isActive = step.key === currentStep;
            const isCompleted = idx < currentIndex;
            const linkHref = getStepLink(step, idx);

            const StepBody = (
              <div
                className={`flex items-baseline gap-1.5 transition-all duration-200 ${
                  isActive
                    ? 'text-ink'
                    : isCompleted
                    ? 'text-ink/70 hover:text-ink'
                    : 'text-ink/30'
                }`}
              >
                <span
                  className={`font-mono text-xs font-semibold ${
                    isActive
                      ? 'text-forest'
                      : isCompleted
                      ? 'text-forest/70'
                      : 'text-ink/30'
                  }`}
                >
                  {step.number}
                </span>
                <span
                  className={`font-heading text-xs sm:text-sm font-semibold tracking-tight ${
                    isActive
                      ? 'text-ink border-b-2 border-forest pb-0.5'
                      : isCompleted
                      ? 'text-ink/80'
                      : 'text-ink/40'
                  }`}
                >
                  {step.label}
                </span>
                <span className="hidden xl:inline text-[10px] font-normal text-ink/50">
                  /{step.sublabel}
                </span>
              </div>
            );

            return (
              <React.Fragment key={step.key}>
                <li className="flex items-center">
                  {linkHref && !isActive ? (
                    <Link to={linkHref} className="cursor-pointer group">
                      {StepBody}
                    </Link>
                  ) : (
                    <div>{StepBody}</div>
                  )}
                </li>

                {idx < STEPS.length - 1 && (
                  <li
                    aria-hidden="true"
                    className={`flex-1 h-px mx-1 sm:mx-2 transition-colors ${
                      idx < currentIndex ? 'bg-forest/40' : 'bg-border'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
    </div>
  );
};
