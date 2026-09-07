import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SuperAdminDashboardTablet } from '../tablet/dashboards/SuperAdminDashboardTablet';
import { SuperAdminDashboardMobile } from '../mobile/dashboards/SuperAdminDashboardMobile';
import { getStaggerDelay } from '../../lib/motion';
import type { User } from '../../types';

const SuperAdminDashboardDesktop: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await usersApi.getUsers();
        setUsers(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load user accounts from the server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const countsByRole = users.reduce<Record<string, number>>((acc, u) => {
    const role = u.role_label || 'Unknown';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const superAdminCount = countsByRole['Super Admin'] || 0;
  const schoolAdminCount = countsByRole['School Admin'] || 0;
  const teacherCount = countsByRole['Teacher'] || 0;
  const studentCount = countsByRole['Student'] || 0;

  return (
    <div className="space-y-10">
      {/* ── Top Typographic Headline with embedded stats ── */}
      <div className="space-y-2 border-b border-border pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Global Tenant Control
        </div>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
          Super Admin Directory
        </h1>
        <p className="font-body text-ink/75 text-base max-w-3xl leading-relaxed">
          Overseeing{' '}
          <span className="font-heading font-bold text-forest text-lg underline decoration-forest/40 underline-offset-2">
            {users.length} active system user accounts
          </span>{' '}
          spanning all school institutions and global permissions.
        </p>
      </div>

      {isLoading && (
        <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60 font-medium">
          Loading institutional directory...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && (
        <>
          {/* ── Reference 01 (Truus Category Cards): Fanned / Staggered Card Composition ── */}
          <section className="pt-4 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink/60">
                // System Roles Breakdown
              </span>
              <span className="text-xs text-ink/50 italic">
                Interactive role deck (Hover to inspect)
              </span>
            </div>

            {/* Fanned Card Row — staggered Y offsets, unequal heights, rotation, flat saturated token colors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-3 items-end pt-6">
              
              {/* Card 1: Super Admins (Forest Green Accent) - tilted left */}
              <div
                style={getStaggerDelay(0)}
                className="animate-card-enter transform lg:-rotate-2 lg:translate-y-2 hover:-translate-y-2 hover:rotate-0 transition-all duration-200 ease-out hover:shadow-md active:scale-[0.99] bg-forest text-white rounded-card p-5 shadow-card flex flex-col justify-between min-h-[220px]"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="pill pill-lime text-[10px] uppercase tracking-wide">
                      Global Scope
                    </span>
                    <span className="font-mono font-bold text-xs opacity-70">#01</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl lowercase tracking-tight mb-1 text-white">
                    super admins
                  </h2>
                  <p className="text-xs text-white/80 leading-snug mb-4">
                    Unrestricted control over tenants, schools & system schemas.
                  </p>
                </div>
                <div className="border-t border-white/20 pt-3">
                  <div className="font-heading font-bold text-3xl text-lime leading-none mb-1">
                    {superAdminCount}
                  </div>
                  <span className="text-[11px] text-white/75 font-mono">10 Capabilities Enabled</span>
                </div>
              </div>

              {/* Card 2: School Admins (Burnt Ember Accent) - tilted slight right, taller */}
              <div
                style={getStaggerDelay(1)}
                className="animate-card-enter transform lg:rotate-1 lg:-translate-y-3 hover:-translate-y-3 hover:rotate-0 transition-all duration-200 ease-out hover:shadow-md active:scale-[0.99] bg-ember text-white rounded-card p-5 shadow-card flex flex-col justify-between min-h-[245px]"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="pill bg-white text-ink text-[10px] uppercase tracking-wide">
                      School Scope
                    </span>
                    <span className="font-mono font-bold text-xs opacity-70">#02</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl lowercase tracking-tight mb-1 text-white">
                    school admins
                  </h2>
                  <p className="text-xs text-white/80 leading-snug mb-4">
                    Managing localized faculty rosters and classroom permissions.
                  </p>
                </div>
                <div className="border-t border-white/20 pt-3">
                  <div className="font-heading font-bold text-3xl text-white leading-none mb-1">
                    {schoolAdminCount}
                  </div>
                  <span className="text-[11px] text-white/75 font-mono">School Authorities</span>
                </div>
              </div>

              {/* Card 3: Teachers (Dusty Grape Accent) - tilted slight left */}
              <div
                style={getStaggerDelay(2)}
                className="animate-card-enter transform lg:-rotate-1 lg:translate-y-1 hover:-translate-y-2 hover:rotate-0 transition-all duration-200 ease-out hover:shadow-md active:scale-[0.99] bg-grape text-white rounded-card p-5 shadow-card flex flex-col justify-between min-h-[230px]"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="pill pill-muted text-[10px] uppercase tracking-wide">
                      Authoring
                    </span>
                    <span className="font-mono font-bold text-xs opacity-70">#03</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl lowercase tracking-tight mb-1 text-white">
                    teachers
                  </h2>
                  <p className="text-xs text-white/80 leading-snug mb-4">
                    Paper creators, exam versioners & evaluation directors.
                  </p>
                </div>
                <div className="border-t border-white/20 pt-3">
                  <div className="font-heading font-bold text-3xl text-white leading-none mb-1">
                    {teacherCount}
                  </div>
                  <span className="text-[11px] text-white/75 font-mono">Exam Builders</span>
                </div>
              </div>

              {/* Card 4: Students (Lime Accent) - tilted right */}
              <div
                style={getStaggerDelay(3)}
                className="animate-card-enter transform lg:rotate-2 lg:-translate-y-1 hover:-translate-y-2 hover:rotate-0 transition-all duration-200 ease-out hover:shadow-md active:scale-[0.99] bg-lime text-ink rounded-card p-5 shadow-card flex flex-col justify-between min-h-[225px]"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="pill bg-ink text-white text-[10px] uppercase tracking-wide">
                      Candidates
                    </span>
                    <span className="font-mono font-bold text-xs opacity-70">#04</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl lowercase tracking-tight mb-1 text-ink">
                    students
                  </h2>
                  <p className="text-xs text-ink/80 leading-snug mb-4">
                    Assigned candidates taking adaptive assessments & review.
                  </p>
                </div>
                <div className="border-t border-ink/20 pt-3">
                  <div className="font-heading font-bold text-3xl text-ink leading-none mb-1">
                    {studentCount}
                  </div>
                  <span className="text-[11px] text-ink/75 font-mono">Test Candidates</span>
                </div>
              </div>

              {/* Card 5: Institutions (Surface Accent) - upright, staggered */}
              <div
                style={getStaggerDelay(4)}
                className="animate-card-enter transform lg:rotate-0 lg:translate-y-3 hover:-translate-y-1 transition-all duration-200 ease-out hover:shadow-md active:scale-[0.99] bg-surface border-2 border-border text-ink rounded-card p-5 shadow-card flex flex-col justify-between min-h-[215px]"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="pill pill-forest text-[10px] uppercase tracking-wide">
                      Infra
                    </span>
                    <span className="font-mono font-bold text-xs opacity-70">#05</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl lowercase tracking-tight mb-1 text-ink">
                    schools
                  </h2>
                  <p className="text-xs text-ink/70 leading-snug mb-4">
                    Institutional school tenants registered in this cluster.
                  </p>
                </div>
                <div className="border-t border-border pt-3">
                  <div className="font-heading font-bold text-3xl text-forest leading-none mb-1">
                    Active
                  </div>
                  <span className="text-[11px] text-ink/60 font-mono">Multi-Tenant Scoped</span>
                </div>
              </div>

            </div>
          </section>

          {/* ── Asymmetric Two-Column Split for Data & Management ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left wide area: User Directory Table (8 cols) */}
            <div className="lg:col-span-8 bg-surface border border-border rounded-lg p-6 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
                <div>
                  <h2 className="font-heading font-bold text-xl text-ink">
                    User Accounts Roster
                  </h2>
                  <p className="text-xs text-ink/65 mt-0.5">
                    Complete authentication and role registry across all partitions
                  </p>
                </div>
                <span className="font-mono text-xs text-ink/60 bg-surface-muted px-2.5 py-1 rounded-pill border border-border self-start sm:self-auto">
                  Total: {users.length} accounts
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-ink/60 font-mono uppercase tracking-wider">
                      <th className="py-3 px-3">UID</th>
                      <th className="py-3 px-3">Username</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">School ID</th>
                      <th className="py-3 px-3 text-right">Capabilities</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-bg/60 transition-colors">
                        <td className="py-3 px-3 font-mono text-ink/70">#{u.id}</td>
                        <td className="py-3 px-3 font-heading font-semibold text-ink text-sm">
                          {u.username}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`pill ${
                              u.role_label === 'Super Admin'
                                ? 'pill-forest'
                                : u.role_label === 'School Admin'
                                ? 'pill-ember'
                                : u.role_label === 'Teacher'
                                ? 'pill-grape'
                                : 'pill-lime'
                            }`}
                          >
                            {u.role_label}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-ink/70">
                          {u.school ? `School #${u.school}` : <span className="italic text-ink/40">Global</span>}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-mono font-semibold bg-surface-muted border border-border px-2 py-0.5 rounded-sm">
                            {u.capabilities?.length || 0} caps
                          </span>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-ink/50 italic">
                          No users registered in directory.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right narrow column: Schools Infrastructure Panel (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-surface border border-border rounded-lg p-6 shadow-card space-y-4">
                <div className="border-b border-border pb-3">
                  <span className="pill pill-forest text-[10px] mb-2">Cluster Config</span>
                  <h3 className="font-heading font-bold text-lg text-ink">
                    Schools Management
                  </h3>
                  <p className="text-xs text-ink/65 mt-1">
                    Multi-tenant institutional infrastructure status
                  </p>
                </div>

                <div className="bg-bg rounded-card border border-border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <span className="w-2 h-2 rounded-full bg-forest" />
                    REST Endpoint Status
                  </div>
                  <p className="text-xs text-ink/70 leading-relaxed">
                    Schools list backend endpoint pending integration. Scoped school admin creation and paper segregation active.
                  </p>
                </div>

                <div className="space-y-2 pt-2 text-xs text-ink/80">
                  <div className="flex justify-between py-1.5 border-b border-border/60">
                    <span className="text-ink/60">Tenant Isolation</span>
                    <span className="font-mono font-semibold text-forest">ENFORCED</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/60">
                    <span className="text-ink/60">Capability RBAC</span>
                    <span className="font-mono font-semibold text-forest">ACTIVE</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-ink/60">Database Seed</span>
                    <span className="font-mono font-semibold text-ink">Demo Set v1</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export const SuperAdminDashboard: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <SuperAdminDashboardMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <SuperAdminDashboardTablet key="tablet" />;
  }
  return <SuperAdminDashboardDesktop key="desktop" />;
};
