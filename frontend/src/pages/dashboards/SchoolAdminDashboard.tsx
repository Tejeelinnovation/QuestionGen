import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SchoolAdminDashboardTablet } from '../tablet/dashboards/SchoolAdminDashboardTablet';
import { SchoolAdminDashboardMobile } from '../mobile/dashboards/SchoolAdminDashboardMobile';
import { getStaggerDelay, MOTION } from '../../lib/motion';
import { UpdateUserModal } from '../../components/users/UpdateUserModal';
import { Edit2 } from 'lucide-react';
import type { User } from '../../types';

const SchoolAdminDashboardDesktop: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  // Create Teacher form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load school users.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!username.trim() || !password.trim()) {
      setFormError('Username and password are required.');
      return;
    }

    setIsCreating(true);
    try {
      const newUser = await usersApi.createUser({
        username: username.trim(),
        password: password.trim(),
        profile: 'teacher',
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
      });

      setFormSuccess(`Teacher "${newUser.username}" created successfully.`);
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      fetchUsers();
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to create teacher account.';
      setFormError(detail);
    } finally {
      setIsCreating(false);
    }
  };

  // Teachers in school (backend scopes /api/users/ to school)
  const teachers = users.filter((u) => u.role_label === 'Teacher');

  return (
    <div className="space-y-8">
      {/* ── Top Typographic Headline with embedded stats ── */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-ember">
            <span className="w-2 h-2 rounded-full bg-ember" />
            School Administration
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Faculty & Department Management
          </h1>
          <p className="font-body text-ink/75 text-base max-w-2xl leading-relaxed">
            Directing{' '}
            <span className="font-heading font-bold text-ember text-lg underline decoration-ember/40 underline-offset-2">
              {teachers.length} certified teachers
            </span>{' '}
            in this school branch with question authoring and delivery permissions.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={isLoading}
          className="self-start md:self-auto px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-ink hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : '↻ Refresh Roster'}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── Asymmetric Layout: Stacked Faculty Cards (Left) vs Onboarding Panel (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Stacked Teacher Cards (Ref: 09_blog_cards.jpg rhythm) (62% width = 7.5 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-heading font-bold text-xl text-ink">
              Faculty Roster
            </h2>
            <span className="font-mono text-xs text-ink/60 bg-surface px-2.5 py-1 rounded-pill border border-border">
              {teachers.length} Active Faculty
            </span>
          </div>

          {isLoading && (
            <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60">
              Loading faculty records...
            </div>
          )}

          {!isLoading && teachers.length === 0 && (
            <div className="bg-surface border-2 border-dashed border-border rounded-lg p-10 text-center space-y-3">
              <span className="pill pill-ember text-xs">Roster Empty</span>
              <h3 className="font-heading font-bold text-lg text-ink">No Teachers Registered</h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto">
                Use the form on the right to onboard your first faculty member to this institution.
              </p>
            </div>
          )}

          {!isLoading && (
            <div className="space-y-3.5">
              {teachers.map((t, idx) => {
                const fullName = [t.first_name, t.last_name].filter(Boolean).join(' ');

                return (
                  <div
                    key={t.id}
                    style={getStaggerDelay(idx)}
                    className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card hover:border-border-strong group ${MOTION.hoverLift.className} ${MOTION.touch.card.className}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="pill pill-ember text-[10px]">
                            Teacher #{t.id}
                          </span>
                          <span className="font-mono text-xs text-ink/50">
                            @{t.username}
                          </span>
                        </div>

                        <h3 className="font-heading font-bold text-lg text-ink group-hover:text-ember transition-colors">
                          {fullName || t.username}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/70 pt-1">
                          {t.email ? (
                            <span className="flex items-center gap-1 font-mono">
                              ✉ {t.email}
                            </span>
                          ) : (
                            <span className="text-ink/40 italic">No email recorded</span>
                          )}
                          <span className="text-ink/40">•</span>
                          <span className="font-medium text-forest">
                            Authoring Authorized
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          id={`edit-teacher-${t.id}`}
                          onClick={() => setEditUserId(t.id)}
                          className="px-3 py-1 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <span className="hidden sm:inline-block font-mono text-xs font-semibold px-2.5 py-1 rounded-pill bg-bg border border-border text-ink/70">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Sticky "Create New Teacher" Onboarding Form (38% width = 5 cols) */}
        <div className="lg:col-span-5 sticky top-24">
          <div className="bg-surface border border-border rounded-lg p-6 sm:p-7 shadow-card space-y-5">
            <div className="border-b border-border pb-4">
              <span className="pill pill-forest text-[10px] uppercase mb-2">Onboarding</span>
              <h2 className="font-heading font-bold text-xl text-ink">
                Create New Teacher
              </h2>
              <p className="text-xs text-ink/65 mt-1">
                Provision authoring credentials scoped strictly to this school
              </p>
            </div>

            {formSuccess && (
              <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-3.5 text-xs font-medium flex items-center gap-2">
                <span className="font-bold">✓</span>
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3.5 text-xs font-medium flex items-start gap-2">
                <span className="font-bold">!</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div>
                <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-username">
                  Username *
                </label>
                <input
                  id="t-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isCreating}
                  placeholder="e.g. math_faculty_01"
                  required
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-password">
                  Password *
                </label>
                <input
                  id="t-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isCreating}
                  placeholder="Set initial password..."
                  required
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-fname">
                    First Name
                  </label>
                  <input
                    id="t-fname"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isCreating}
                    placeholder="First name"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-lname">
                    Last Name
                  </label>
                  <input
                    id="t-lname"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isCreating}
                    placeholder="Last name"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-email">
                  Email Address
                </label>
                <input
                  id="t-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isCreating}
                  placeholder="teacher@institution.edu"
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                />
              </div>

              <button
                type="submit"
                id="create-teacher-btn"
                disabled={isCreating}
                className="w-full mt-2 rounded-pill bg-ember text-white py-2.5 px-4 text-xs font-heading font-semibold hover:bg-ember/90 transition-all cursor-pointer disabled:opacity-50"
              >
                {isCreating ? 'Provisioning Teacher...' : 'Provision Teacher Account →'}
              </button>
            </form>
          </div>
        </div>

      </div>

      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => fetchUsers()}
      />
    </div>
  );
};

export const SchoolAdminDashboard: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <SchoolAdminDashboardMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <SchoolAdminDashboardTablet key="tablet" />;
  }
  return <SchoolAdminDashboardDesktop key="desktop" />;
};
