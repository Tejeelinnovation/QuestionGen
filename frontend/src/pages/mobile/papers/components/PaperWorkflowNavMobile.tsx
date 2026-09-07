import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export type WorkflowStep = 'setup' | 'configure' | 'review' | 'version' | 'deliver' | 'print';

interface StepMeta {
  stepNumber: number;
  totalSteps: number;
  label: string;
}

const STEP_META: Record<WorkflowStep, StepMeta> = {
  setup: { stepNumber: 1, totalSteps: 5, label: 'Paper Blueprint' },
  configure: { stepNumber: 2, totalSteps: 5, label: 'Question Criteria' },
  review: { stepNumber: 3, totalSteps: 5, label: 'Review & Reorder' },
  version: { stepNumber: 4, totalSteps: 5, label: 'Version Finalize' },
  deliver: { stepNumber: 5, totalSteps: 5, label: 'Schedule Delivery' },
  print: { stepNumber: 5, totalSteps: 5, label: 'Print Summary' },
};

interface PaperWorkflowNavMobileProps {
  currentStep: WorkflowStep;
  paperId?: number;
  paperTitle?: string;
  backTo?: string;
}

export const PaperWorkflowNavMobile: React.FC<PaperWorkflowNavMobileProps> = ({
  currentStep,
  paperTitle,
  backTo,
}) => {
  const navigate = useNavigate();
  const meta = STEP_META[currentStep];

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="pb-3 border-b border-border space-y-1.5 font-body">
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 font-heading font-semibold text-forest active:scale-95 transition-transform cursor-pointer py-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <span className="font-mono text-[11px] text-ink/60 bg-surface px-2.5 py-0.5 rounded-pill border border-border">
          Step {meta.stepNumber} of {meta.totalSteps}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading font-bold text-sm text-ink truncate">
          {meta.label}
        </h2>
        {paperTitle && (
          <span className="text-[11px] text-ink/60 truncate max-w-[150px]">
            {paperTitle}
          </span>
        )}
      </div>
    </div>
  );
};
