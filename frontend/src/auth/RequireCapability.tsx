import React from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, RotateCw, Lock, User as UserIcon } from 'lucide-react';
import { useAuth } from './AuthContext';
import { SkeletonPage } from '../components/ui/skeleton';
import type { CapabilityName } from '../types';

interface RequireCapabilityProps {
  capability?: CapabilityName;
  anyOf?: CapabilityName[];
  children: ReactNode;
}

const CAPABILITY_METADATA: Record<string, { label: string; description: string }> = {
  UPLOAD_STUDY_MATERIAL: {
    label: 'Upload Study Material',
    description: 'Submit reference textbooks, notes, and past papers to the AI dataset ingestion pipeline.',
  },
  CREATE_SCHOOL: {
    label: 'Institutional Management',
    description: 'Create, update, and manage institutional school tenant configurations.',
  },
  CREATE_SCHOOL_ADMIN: {
    label: 'School Admin Provisioning',
    description: 'Appoint administrative personnel for registered schools.',
  },
  CREATE_TEACHER: {
    label: 'Faculty Provisioning',
    description: 'Register and manage teaching faculty accounts.',
  },
  CREATE_STUDENT: {
    label: 'Student Enrollment',
    description: 'Enroll and assign candidate accounts to academic classes and divisions.',
  },
  GENERATE_SELECT_QUESTIONS: {
    label: 'Question Paper Studio',
    description: 'Generate, select, and assemble questions from the institutional question bank.',
  },
  CREATE_PAPER: {
    label: 'Question Paper Authoring',
    description: 'Create and structure standardized assessment papers.',
  },
  ASSIGN_TEST: {
    label: 'Test Delivery & Assignment',
    description: 'Distribute tests and mock assessments to classes and student batches.',
  },
  ATTEMPT_TEST: {
    label: 'Examination Attempt',
    description: 'Take scheduled tests and submit question papers.',
  },
  VIEW_OWN_RESULT: {
    label: 'Result Analytics',
    description: 'Review personal performance records and detailed evaluations.',
  },
  VIEW_SCHOOL_WIDE_CONTROLS: {
    label: 'School-Wide Controls',
    description: 'Access school-wide rosters, class divisions, and institutional configurations.',
  },
  INGEST_GLOBAL_QUESTIONS: {
    label: 'Global Question Bank Ingestion',
    description: 'Manage and ingest central repository items.',
  },
  DATA_ENTRY_OPERATOR: {
    label: 'Data Entry Operations',
    description: 'Transcribe and input raw questions into review queues.',
  },
  VALIDATOR: {
    label: 'Question Validation',
    description: 'Verify accuracy, syllabus tags, and academic correctness of questions.',
  },
};

export const RequireCapability: React.FC<RequireCapabilityProps> = ({ capability, anyOf, children }) => {
  const { user, isLoading, hasCapability } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SkeletonPage />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAuthorized = anyOf
    ? anyOf.some((cap) => hasCapability(cap))
    : capability
    ? hasCapability(capability)
    : true;

  if (!isAuthorized) {
    const requiredCaps: string[] = anyOf || (capability ? [capability] : []);

    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6 animate-fade-in font-body">
        <div className="max-w-lg w-full bg-surface border border-border rounded-2xl shadow-float p-6 sm:p-8 space-y-6 animate-scale-up relative overflow-hidden">
          {/* Subtle top decorative accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500" />

          {/* Icon and Title */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h1 className="font-heading font-bold text-xl sm:text-2xl text-ink tracking-tight">
                Access Restricted
              </h1>
              <p className="text-xs sm:text-sm text-ink/65 max-w-sm mx-auto leading-relaxed">
                This page requires specific privileges that are not currently enabled on your account.
              </p>
            </div>
          </div>

          {/* Current Signed-In Context */}
          <div className="px-3.5 py-2 rounded-xl bg-surface-muted/60 border border-border/70 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <UserIcon className="w-3.5 h-3.5 text-forest shrink-0" />
              <span className="font-medium text-ink truncate">@{user.username}</span>
            </div>
            <span className="px-2 py-0.5 rounded-pill bg-surface border border-border/80 font-mono text-[10px] text-ink/70 font-semibold shrink-0">
              {user.role_label || 'User'}
            </span>
          </div>

          {/* Required Permissions Breakdown */}
          <div className="p-4 rounded-xl bg-surface-muted/40 border border-border space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-heading font-semibold text-ink">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Required Permission</span>
            </div>

            <div className="space-y-2">
              {requiredCaps.map((capKey) => {
                const meta = CAPABILITY_METADATA[capKey] || {
                  label: capKey.replace(/_/g, ' '),
                  description: 'Special administrative or role-based permission.',
                };

                return (
                  <div
                    key={capKey}
                    className="p-2.5 rounded-lg bg-surface border border-border/70 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading font-bold text-xs text-ink">
                        {meta.label}
                      </span>
                      <code className="text-[10px] font-mono text-ink/50 bg-surface-muted px-1.5 py-0.5 rounded">
                        {capKey}
                      </code>
                    </div>
                    <p className="text-[11px] text-ink/60 leading-relaxed font-body">
                      {meta.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-ink/65 leading-relaxed pt-1">
              To request access, contact your <strong>School Administrator</strong> or <strong>Super Admin</strong>. They can grant this permission individually or enable it school-wide for your role.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
            <Link
              to="/"
              className="w-full sm:w-auto px-6 py-2.5 rounded-pill bg-forest hover:bg-forest/90 text-white font-heading font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </Link>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2.5 rounded-pill border border-border bg-surface hover:bg-surface-muted text-ink/75 font-heading font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Re-check Permission</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
