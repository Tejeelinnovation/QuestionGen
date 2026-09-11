import React, { useState } from 'react';
import { usersApi } from '../../api/users';
import type { CapabilityName, User } from '../../types';
import { Shield, ShieldAlert, Check, RefreshCw } from 'lucide-react';

interface CapabilityMeta {
  name: CapabilityName;
  label: string;
  description: string;
  category: 'Administration' | 'Curriculum & Papers' | 'Examination & Results';
}

export const ALL_CAPABILITIES: CapabilityMeta[] = [
  {
    name: 'CREATE_SCHOOL',
    label: 'Create School',
    description: 'Register and configure new educational institution tenants.',
    category: 'Administration',
  },
  {
    name: 'CREATE_SCHOOL_ADMIN',
    label: 'Create School Admin',
    description: 'Provision administrator credentials for institutional management.',
    category: 'Administration',
  },
  {
    name: 'CREATE_TEACHER',
    label: 'Create Teacher',
    description: 'Provision authoring faculty credentials scoped to a school.',
    category: 'Administration',
  },
  {
    name: 'CREATE_STUDENT',
    label: 'Create Student',
    description: 'Enroll candidates and create student examinee accounts.',
    category: 'Administration',
  },
  {
    name: 'VIEW_SCHOOL_WIDE_CONTROLS',
    label: 'School-Wide Controls',
    description: 'Inspect cross-faculty rosters and paper records within a school.',
    category: 'Administration',
  },
  {
    name: 'GENERATE_SELECT_QUESTIONS',
    label: 'Select / Generate Questions',
    description: 'Query question banks and preview curriculum items for papers.',
    category: 'Curriculum & Papers',
  },
  {
    name: 'CREATE_PAPER',
    label: 'Create Papers',
    description: 'Draft, configure, version, and finalize exam question papers.',
    category: 'Curriculum & Papers',
  },
  {
    name: 'ASSIGN_TEST',
    label: 'Assign Test Deliveries',
    description: 'Schedule and deploy tests to assigned student groups or print.',
    category: 'Curriculum & Papers',
  },
  {
    name: 'ATTEMPT_TEST',
    label: 'Attempt Tests',
    description: 'Sit active test deliveries, respond to questions, and submit.',
    category: 'Examination & Results',
  },
  {
    name: 'VIEW_OWN_RESULT',
    label: 'View Own Results',
    description: 'Inspect graded scores and evaluated answer breakdowns.',
    category: 'Examination & Results',
  },
];

export const getDefaultCapabilitiesForRole = (roleLabel: string): CapabilityName[] => {
  switch (roleLabel) {
    case 'Super Admin':
      return ALL_CAPABILITIES.map((c) => c.name);
    case 'School Admin':
      return ['CREATE_TEACHER', 'CREATE_STUDENT', 'VIEW_SCHOOL_WIDE_CONTROLS'];
    case 'Teacher':
      return ['CREATE_STUDENT', 'GENERATE_SELECT_QUESTIONS', 'CREATE_PAPER', 'ASSIGN_TEST'];
    case 'Student':
      return ['ATTEMPT_TEST', 'VIEW_OWN_RESULT'];
    default:
      return [];
  }
};

const ALLOWED_CAPABILITIES_BY_ROLE: Record<string, CapabilityName[]> = {
  'Super Admin': ALL_CAPABILITIES.map((c) => c.name),
  'School Admin': ['CREATE_TEACHER', 'CREATE_STUDENT', 'VIEW_SCHOOL_WIDE_CONTROLS'],
  'Teacher': ['CREATE_STUDENT', 'GENERATE_SELECT_QUESTIONS', 'CREATE_PAPER', 'ASSIGN_TEST'],
  'Student': ['ATTEMPT_TEST', 'VIEW_OWN_RESULT'],
};

/**
 * Returns capabilities that CANNOT be toggled for a given target role.
 * Enforces strict role scopes:
 * - Super Admin: all 10 caps allowed (0 locked)
 * - School Admin: 3 caps allowed (7 locked)
 * - Teacher: 4 caps allowed (6 locked)
 * - Student: 2 caps allowed (8 locked)
 * Also ensures School Admins cannot modify Super Admins or other School Admins.
 */
const getLockedCapsForRole = (targetRole: string, editorRole?: string): CapabilityName[] => {
  // School Admins cannot modify Super Admin or School Admin capabilities
  if (editorRole === 'School Admin' && (targetRole === 'Super Admin' || targetRole === 'School Admin')) {
    return ALL_CAPABILITIES.map((c) => c.name);
  }
  // Teachers and Students cannot modify anyone
  if (editorRole === 'Teacher' || editorRole === 'Student') {
    return ALL_CAPABILITIES.map((c) => c.name);
  }

  const allowed = ALLOWED_CAPABILITIES_BY_ROLE[targetRole];
  if (!allowed) {
    return ALL_CAPABILITIES.map((c) => c.name);
  }
  return ALL_CAPABILITIES.map((c) => c.name).filter((c) => !allowed.includes(c));
};

interface PermissionManagerProps {
  user: User;
  /** Role label of the person performing the edit (e.g. 'Super Admin'). */
  editorRole?: string;
  onCapabilityChange?: (newCapabilities: CapabilityName[]) => void;
}

export const PermissionManager: React.FC<PermissionManagerProps> = ({
  user,
  editorRole,
  onCapabilityChange,
}) => {
  const [grantedCaps, setGrantedCaps] = useState<CapabilityName[]>(user.capabilities || []);
  const [pendingCap, setPendingCap] = useState<CapabilityName | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const defaultCaps = getDefaultCapabilitiesForRole(user.role_label);
  // Caps that are off-limits based on the target user's role and editor role
  const lockedCaps = getLockedCapsForRole(user.role_label, editorRole);

  const handleToggle = async (capName: CapabilityName) => {
    const isCurrentlyGranted = grantedCaps.includes(capName);
    setErrorMsg(null);
    setSuccessNotice(null);
    setPendingCap(capName);

    try {
      if (isCurrentlyGranted) {
        await usersApi.revokePermission(user.id, capName);
        const updated = grantedCaps.filter((c) => c !== capName);
        setGrantedCaps(updated);
        onCapabilityChange?.(updated);
        setSuccessNotice(`Revoked ${capName}`);
      } else {
        await usersApi.grantPermission(user.id, capName);
        const updated = [...grantedCaps, capName];
        setGrantedCaps(updated);
        onCapabilityChange?.(updated);
        setSuccessNotice(`Granted ${capName}`);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        `Failed to update permission ${capName}.`;
      setErrorMsg(msg);
    } finally {
      setPendingCap(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-forest" />
            <h3 className="font-heading font-bold text-base text-ink">
              Capability Permission Matrix
            </h3>
          </div>
          <p className="text-xs text-ink/65 mt-0.5">
            Real-time atomic permissions for @{user.username} ({user.role_label})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="pill pill-forest text-[11px] font-mono">
            {grantedCaps.filter((c) => !lockedCaps.includes(c)).length} / {ALL_CAPABILITIES.filter((c) => !lockedCaps.includes(c.name)).length} active
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successNotice && (
        <div className="p-2.5 rounded-card bg-forest/10 border border-forest/20 text-forest text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
          <Check className="w-3.5 h-3.5" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Capabilities List / Grid - Only display editable capabilities for target role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ALL_CAPABILITIES.filter((cap) => !lockedCaps.includes(cap.name)).map((cap) => {
          const isGranted = grantedCaps.includes(cap.name);
          const isDefault = defaultCaps.includes(cap.name);
          const isCustomGranted = isGranted && !isDefault;
          const isRevokedDefault = !isGranted && isDefault;
          const isBusy = pendingCap === cap.name;

          return (
            <div
              key={cap.name}
              className={`p-3.5 rounded-card border transition-all flex flex-col justify-between min-h-[96px] ${
                isGranted
                  ? 'bg-surface border-border hover:border-forest/40 shadow-xs'
                  : 'bg-surface-muted/50 border-border/70 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-heading font-semibold text-xs text-ink">
                      {cap.label}
                    </span>

                    {/* Role pyramid boundary lock badge */}
                    {/* Tag indicating default profile vs custom */}
                    {isCustomGranted && (
                      <span className="pill pill-ember text-[9px] py-0 px-1.5 font-mono">
                        Custom Grant
                      </span>
                    )}
                    {isRevokedDefault && (
                      <span className="pill pill-muted text-[9px] py-0 px-1.5 font-mono text-ember">
                        Default Revoked
                      </span>
                    )}
                    {isGranted && isDefault && (
                      <span className="pill pill-lime text-[9px] py-0 px-1.5 font-mono">
                        Role Default
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-ink/65 leading-snug line-clamp-2">
                    {cap.description}
                  </p>
                </div>

                {/* Instant Action Toggle Switch */}
                <button
                    type="button"
                    id={`toggle-cap-${cap.name}`}
                    role="switch"
                    aria-checked={isGranted}
                    disabled={isBusy}
                    onClick={() => handleToggle(cap.name)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-pill border-2 border-transparent transition-colors duration-100 ease-in-out focus:outline-hidden disabled:opacity-50 min-h-[24px] ${
                      isGranted ? 'bg-forest' : 'bg-ink/20'
                    }`}
                    title={`Toggle ${cap.label}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-100 ease-in-out flex items-center justify-center ${
                        isGranted ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    >
                      {isBusy ? (
                        <RefreshCw className="w-2.5 h-2.5 text-forest animate-spin" />
                      ) : isGranted ? (
                        <Check className="w-2.5 h-2.5 text-forest stroke-[3]" />
                      ) : null}
                    </span>
                  </button>
              </div>

              <div className="pt-2 mt-1 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-ink/50">
                <span>{cap.name}</span>
                <span className={isGranted ? 'text-forest font-semibold' : 'text-ink/40'}>
                  {isGranted ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
