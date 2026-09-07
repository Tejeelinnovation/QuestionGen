import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import type { User } from '../../../types';
import { Building2, UserPlus, CheckCircle2 } from 'lucide-react';

export const SchoolAdminDashboardMobile: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create Teacher form state
  const [showAddForm, setShowAddForm] = useState(false);
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

      setFormSuccess(`Teacher "${newUser.username}" added successfully.`);
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setShowAddForm(false);
      fetchUsers();
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.username?.[0] ||
        err.response?.data?.password?.[0] ||
        'Failed to create teacher account.';
      setFormError(detail);
    } finally {
      setIsCreating(false);
    }
  };

  const teachers = users.filter((u) => u.role_label === 'Teacher');
  const students = users.filter((u) => u.role_label === 'Student');

  return (
    <div className="space-y-5 font-body">
      {/* ── Top Header ── */}
      <div className="space-y-1.5 border-b border-border pb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-ember">
          <Building2 className="w-3 h-3 text-ember" />
          School Operations
        </div>
        <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
          School Administration
        </h1>
        <p className="text-xs text-ink/70">
          Manage faculty instructors and student rosters for your institution.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── Prominent Single Headline Stat Block ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-4xl text-ember tracking-tight">
              {teachers.length}
            </span>
            <span className="font-heading font-semibold text-sm text-ink/80">
              Active Faculty Teachers
            </span>
          </div>
          <span className="pill pill-lime text-xs">
            {students.length} Students
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-ink/70">
          <span>Institutional Staff: {users.length} total</span>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-3 py-1 rounded-pill bg-ember text-white font-heading font-semibold text-xs active:scale-95 transition-transform cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Close Form' : '+ Add Teacher'}</span>
          </button>
        </div>
      </div>

      {/* ── Expandable Add Teacher Card ── */}
      {showAddForm && (
        <div className="p-4 rounded-card bg-surface border border-ember/30 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="font-heading font-bold text-sm text-ink flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-ember" />
              New Faculty Instructor
            </h2>
            <span className="pill pill-ember text-[10px]">Staff Role</span>
          </div>

          {formError && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-2.5 text-xs">
              {formError}
            </div>
          )}

          <form onSubmit={handleCreateTeacher} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-heading font-semibold text-ink">Username *</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. teacher_science"
                required
                className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
              />
            </div>

            <div className="space-y-1">
              <label className="font-heading font-semibold text-ink">Temporary Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-heading font-semibold text-ink">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
                />
              </div>
              <div className="space-y-1">
                <label className="font-heading font-semibold text-ink">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-heading font-semibold text-ink">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="faculty@school.edu"
                className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-2.5 rounded-pill bg-ember text-white font-heading font-semibold text-xs active:scale-95 transition-all shadow-xs min-h-[44px] cursor-pointer disabled:opacity-50"
            >
              {isCreating ? 'Saving Faculty...' : 'Confirm & Create Account'}
            </button>
          </form>
        </div>
      )}

      {formSuccess && (
        <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {formSuccess}
        </div>
      )}

      {/* ── Single-Column Faculty Feed ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>FACULTY MEMBERS ({teachers.length})</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-ink/50 bg-surface border border-border rounded-card">
            Loading school faculty...
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No teachers registered yet. Use the form above to add faculty.
          </div>
        ) : (
          teachers.map((t) => (
            <div
              key={t.id}
              className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-sm text-ink">
                  {t.first_name || t.last_name
                    ? `${t.first_name || ''} ${t.last_name || ''}`.trim()
                    : t.username}
                </span>
                <span className="pill pill-grape text-[10px] py-0.5">Faculty</span>
              </div>
              <div className="text-xs text-ink/60 font-mono">
                @{t.username} {t.email && `• ${t.email}`}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
