import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { Edit2 } from 'lucide-react';
import type { User } from '../../../types';

export const SchoolAdminDashboardTablet: React.FC = () => {
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

  const teachers = users.filter((u) => u.role_label === 'Teacher');

  return (
    <div className="space-y-8 font-body">
      {/* ── Top Header ── */}
      <div className="space-y-2 border-b border-border pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-ember">
          <span className="w-2 h-2 rounded-full bg-ember" />
          Institutional Scope • Tablet
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          School Administration
        </h1>
        <p className="text-sm text-ink/75 leading-relaxed">
          Manage teacher onboarding, assign departmental roles, and oversee classroom examinations.
        </p>
      </div>

      {isLoading && (
        <div className="p-8 text-center bg-surface border border-border rounded-card text-ink/60 text-sm">
          Loading school faculty roster...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* ── Column 1: Touch-Optimized Create Teacher Form ── */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="border-b border-border pb-3">
              <h2 className="font-heading font-bold text-xl text-ink">
                Onboard Faculty Teacher
              </h2>
              <p className="text-xs text-ink/60">
                Create institutional login credentials for examination authors
              </p>
            </div>

            {formSuccess && (
              <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-3.5 text-xs font-semibold flex items-center gap-2">
                <span>✓</span>
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3.5 text-xs font-medium flex items-center gap-2">
                <span>!</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTeacher} className="space-y-3.5">
              <div>
                <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isCreating}
                  placeholder="e.g. jsmith_math"
                  required
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:bg-surface focus:border-ember focus:outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isCreating}
                  placeholder="Minimum 8 characters..."
                  required
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:bg-surface focus:border-ember focus:outline-none min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isCreating}
                    placeholder="Jane"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-ember focus:outline-none min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isCreating}
                    placeholder="Smith"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-ember focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isCreating}
                  placeholder="teacher@institution.edu"
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-ember focus:outline-none min-h-[44px]"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3 px-4 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 active:scale-95 transition-all cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
              >
                <span>{isCreating ? 'Creating Faculty Account...' : '+ Create Teacher Account'}</span>
              </button>
            </form>
          </div>

          {/* ── Column 2: Active Teachers Roster (Tablet Bento) ── */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="font-heading font-bold text-xl text-ink">
                  Active Faculty Roster
                </h2>
                <p className="text-xs text-ink/60">
                  Certified course creators in your school
                </p>
              </div>
              <span className="pill pill-grape text-xs">
                {teachers.length} Teachers
              </span>
            </div>

            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
              {teachers.map((t, idx) => {
                const fullName = [t.first_name, t.last_name].filter(Boolean).join(' ');
                return (
                  <div
                    key={t.id}
                    style={getStaggerDelay(idx)}
                    className={`animate-card-enter p-3.5 rounded-card bg-bg border border-border/80 flex items-center justify-between gap-3 ${MOTION.touch.card.className}`}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-heading font-bold text-sm text-ink truncate">
                        {fullName || t.username}
                      </div>
                      <div className="font-mono text-[11px] text-ink/50 truncate">
                        @{t.username} {t.email ? `• ${t.email}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        id={`tablet-edit-teacher-${t.id}`}
                        onClick={() => setEditUserId(t.id)}
                        className="px-2.5 py-1 rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white text-xs font-heading font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <span className="font-mono text-[10px] text-ink/50 bg-surface px-2 py-1 rounded border border-border">
                        #{t.id}
                      </span>
                    </div>
                  </div>
                );
              })}

              {teachers.length === 0 && (
                <div className="py-12 text-center text-xs text-ink/50 italic">
                  No teachers registered in this school yet. Use the onboarding form to add your first instructor.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => fetchUsers()}
      />
    </div>
  );
};
