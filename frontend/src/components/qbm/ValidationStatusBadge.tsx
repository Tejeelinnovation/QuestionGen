import React from 'react';
import type { ValidationStatus } from '../../types';

interface ValidationStatusBadgeProps {
  status?: ValidationStatus | string;
  revision?: number;
  className?: string;
}

export const ValidationStatusBadge: React.FC<ValidationStatusBadgeProps> = ({
  status = 'APPROVED',
  revision,
  className = '',
}) => {
  let badgeStyle = 'bg-gray-100 text-gray-700 border-gray-200';
  let label = status;

  switch (status) {
    case 'DRAFT':
      badgeStyle = 'bg-gray-100 text-gray-700 border-gray-200';
      label = 'Draft';
      break;
    case 'SUBMITTED':
      badgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
      label = 'Submitted';
      break;
    case 'UNDER_VALIDATION':
      badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
      label = 'Under Validation';
      break;
    case 'CORRECTION_REQUIRED':
      badgeStyle = 'bg-ember/10 text-ember border-ember/20';
      label = 'Correction Required';
      break;
    case 'APPROVED':
      badgeStyle = 'bg-forest/10 text-forest border-forest/20';
      label = 'Approved';
      break;
    case 'REJECTED':
      badgeStyle = 'bg-red-100 text-red-800 border-red-200';
      label = 'Rejected';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-[11px] font-mono font-medium border ${badgeStyle} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{label}</span>
      {revision && revision > 1 && (
        <span className="ml-0.5 opacity-75 text-[10px]">r{revision}</span>
      )}
    </span>
  );
};
