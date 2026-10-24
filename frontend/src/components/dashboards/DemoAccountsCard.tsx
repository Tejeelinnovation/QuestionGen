import React, { useState } from 'react';
import { authApi } from '../../api/auth';
import {
  GraduationCap,
  BookOpen,
  Building2,
  Database,
  PenTool,
  CheckCircle2,
  Layers,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface DemoAccountsCardProps {
  variant?: 'desktop' | 'tablet' | 'mobile';
  className?: string;
}

type DemoRoleKey = 'teacher' | 'student' | 'school_admin' | 'qbm' | 'deo' | 'validator' | 'dual';

interface DemoRoleButton {
  key: DemoRoleKey;
  label: string;
  tag?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  spanCol?: boolean;
}

const DEMO_BUTTONS: DemoRoleButton[] = [
  {
    key: 'teacher',
    label: 'Teacher',
    icon: GraduationCap,
    accentColor: 'text-[#8B7BC7]',
  },
  {
    key: 'student',
    label: 'Student',
    icon: BookOpen,
    accentColor: 'text-forest',
  },
  {
    key: 'school_admin',
    label: 'School Admin',
    icon: Building2,
    accentColor: 'text-ember',
  },
  {
    key: 'qbm',
    label: 'QBM Engine',
    icon: Database,
    accentColor: 'text-[#0F766E]',
  },
  {
    key: 'deo',
    label: 'DEO (Entry)',
    icon: PenTool,
    accentColor: 'text-sky-700',
  },
  {
    key: 'validator',
    label: 'Validator',
    icon: CheckCircle2,
    accentColor: 'text-emerald-700',
  },
  {
    key: 'dual',
    label: 'DEO & Validator (Dual Mode)',
    tag: 'Dual',
    icon: Layers,
    accentColor: 'text-indigo-600',
    spanCol: true,
  },
];

export const DemoAccountsCard: React.FC<DemoAccountsCardProps> = ({ className = '' }) => {
  const [launchingKey, setLaunchingKey] = useState<DemoRoleKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLaunch = async (roleKey: DemoRoleKey) => {
    setErrorMessage(null);
    setLaunchingKey(roleKey);

    try {
      // 1. Request signed one-time ticket from backend
      const result = await authApi.createDemoTicket(roleKey);

      // 2. Formulate detached, isolated launch URL
      const launchUrl = `/demo/launch?ticket=${encodeURIComponent(result.ticket)}`;

      // 3. Open directly in new tab with the target URL so that about:blank is never shown
      const newWindow = window.open(launchUrl, '_blank');

      // Fallback in case browser strictly blocked window.open
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        const link = document.createElement('a');
        link.href = launchUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      console.error('Failed to launch demo persona:', err);
      const detail =
        err.response?.data?.detail ||
        'Could not generate demo session ticket. Please ensure you are logged in as Super Admin.';
      setErrorMessage(detail);
    } finally {
      setLaunchingKey(null);
    }
  };

  return (
    <div
      className={`bg-surface border border-border rounded-card p-3 sm:p-3.5 shadow-xs space-y-2.5 ${className}`}
    >
      {/* ── Header: Title & Isolated Status ── */}
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
          <span className="font-heading font-bold text-xs uppercase tracking-wide text-ink">
            Demo Sandboxes
          </span>
          <span className="text-[10px] font-mono text-ink/40 hidden sm:inline">
            // Isolated Tabs
          </span>
        </div>
        <span className="text-[10px] font-mono font-medium text-forest bg-forest/8 px-2 py-0.5 rounded-pill border border-forest/15">
          1-Click Launch
        </span>
      </div>

      {errorMessage && (
        <div className="p-2 rounded-card bg-ember/10 border border-ember/25 text-[11px] text-ember flex items-start gap-1.5 leading-tight">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ── Compact 2-Column Role Button Grid ── */}
      <div className="grid grid-cols-2 gap-1.5">
        {DEMO_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const isLaunching = launchingKey === btn.key;

          return (
            <button
              key={btn.key}
              type="button"
              id={`demo-btn-${btn.key}`}
              disabled={Boolean(launchingKey)}
              onClick={() => handleLaunch(btn.key)}
              title={`Launch isolated ${btn.label} session in new tab`}
              className={`group flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-pill border border-border bg-bg hover:bg-surface hover:border-forest/50 hover:shadow-2xs active:scale-[0.98] transition-all text-xs font-heading font-medium text-ink cursor-pointer disabled:opacity-50 ${
                btn.spanCol ? 'col-span-2' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                {isLaunching ? (
                  <Loader2 className="w-3.5 h-3.5 text-forest animate-spin shrink-0" />
                ) : (
                  <Icon className={`w-3.5 h-3.5 ${btn.accentColor} shrink-0 group-hover:scale-105 transition-transform`} />
                )}
                <span className="truncate text-[11px] sm:text-xs font-semibold">
                  {btn.label}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {btn.tag && (
                  <span className="pill text-[9px] py-0 px-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase font-mono">
                    {btn.tag}
                  </span>
                )}
                <ExternalLink className="w-3 h-3 text-ink/35 group-hover:text-forest transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
