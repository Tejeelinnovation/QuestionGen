import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../../../api/users';
import { papersApi } from '../../../api/papers';
import type { User, Delivery } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import {
  Building2,
  UserPlus,
  CheckCircle2,
  Edit2,
  Users,
  GraduationCap,
  FileSpreadsheet,
  Plus,
  ExternalLink,
} from 'lucide-react';

type ActiveTab = 'teachers' | 'students' | 'deliveries';

export const SchoolAdminDashboardMobile: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('teachers');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);

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

  const fetchDeliveries = async () => {
    setIsLoadingDeliveries(true);
    try {
      const data = await papersApi.getDeliveries();
      setDeliveries(data);
    } catch (err: any) {
      console.warn('Failed to load deliveries on mobile:', err);
    } finally {
      setIsLoadingDeliveries(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDeliveries();
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
    <div className="space-y-4 font-body pb-10">
      {/* ── Top Header ── */}
      <div className="space-y-1 border-b border-border pb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-ember">
          <Building2 className="w-3 h-3 text-ember" />
          School Operations • Mobile
        </div>
        <h1 className="font-heading font-bold text-xl text-ink tracking-tight">
          School Administration
        </h1>
        <p className="text-xs text-ink/70">
          Faculty management, student admissions, and examination results.
        </p>
      </div>

      {/* ── Segmented Tab Selector ── */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-surface-muted rounded-pill border border-border">
        <button
          type="button"
          onClick={() => setActiveTab('teachers')}
          className={`py-1.5 px-1 rounded-pill text-[11px] font-heading font-semibold transition-all flex items-center justify-center gap-1 min-h-[36px] ${
            activeTab === 'teachers'
              ? 'bg-ember text-white shadow-xs'
              : 'text-ink/60 hover:text-ink'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Faculty ({teachers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`py-1.5 px-1 rounded-pill text-[11px] font-heading font-semibold transition-all flex items-center justify-center gap-1 min-h-[36px] ${
            activeTab === 'students'
              ? 'bg-forest text-white shadow-xs'
              : 'text-ink/60 hover:text-ink'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Students ({students.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deliveries')}
          className={`py-1.5 px-1 rounded-pill text-[11px] font-heading font-semibold transition-all flex items-center justify-center gap-1 min-h-[36px] ${
            activeTab === 'deliveries'
              ? 'bg-grape text-white shadow-xs'
              : 'text-ink/60 hover:text-ink'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Results ({deliveries.length})</span>
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── TAB 1: FACULTY TEACHERS ── */}
      {activeTab === 'teachers' && (
        <div className="space-y-3">
          {/* Action header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-ink/60">
              FACULTY MEMBERS ({teachers.length})
            </span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-pill bg-ember text-white font-heading font-semibold text-xs active:scale-95 transition-transform cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'Close Form' : 'Add Teacher'}</span>
            </button>
          </div>

          {/* Expandable Add Teacher Card */}
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
                    className="w-full px-3 py-2 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
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
                    className="w-full px-3 py-2 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
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
                      className="w-full px-3 py-2 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-heading font-semibold text-ink">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last"
                      className="w-full px-3 py-2 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
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
                    className="w-full px-3 py-2 rounded-card bg-surface border border-border text-xs focus:outline-none focus:border-forest"
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

          {/* Teacher list */}
          {isLoading ? (
            <div className="p-8 text-center text-xs text-ink/50 bg-surface border border-border rounded-card">
              Loading faculty records...
            </div>
          ) : teachers.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
              No teachers registered yet.
            </div>
          ) : (
            teachers.map((t, idx) => (
              <div
                key={t.id}
                style={getStaggerDelay(idx, true)}
                className={`p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2 ${MOTION.touch.card.className}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-sm text-ink">
                    {t.first_name || t.last_name
                      ? `${t.first_name || ''} ${t.last_name || ''}`.trim()
                      : t.username}
                  </span>
                  <span className="pill pill-ember text-[10px] py-0.5">Faculty</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                  <div className="text-xs text-ink/60 font-mono truncate max-w-[170px]">
                    @{t.username} {t.email && `• ${t.email}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditUserId(t.id)}
                    className="px-2.5 py-1.5 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit & Perms</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB 2: STUDENTS ── */}
      {activeTab === 'students' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-ink/60">
              ENROLLED CANDIDATES ({students.length})
            </span>
            <button
              onClick={() => setIsCreateStudentOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-transform cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Enroll Student</span>
            </button>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-xs text-ink/50 bg-surface border border-border rounded-card">
              Loading student roster...
            </div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center space-y-2 bg-surface border border-dashed border-border rounded-card text-xs text-ink/60">
              <p>No student accounts created yet.</p>
              <button
                type="button"
                onClick={() => setIsCreateStudentOpen(true)}
                className="px-3 py-1.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs"
              >
                + Enroll First Student
              </button>
            </div>
          ) : (
            students.map((s, idx) => {
              const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
              return (
                <div
                  key={s.id}
                  style={getStaggerDelay(idx, true)}
                  className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-sm text-ink">
                      {fullName || s.username}
                    </span>
                    <span className="pill pill-lime text-[10px] py-0.5">Student</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                    <div className="text-xs text-ink/60 font-mono truncate max-w-[170px]">
                      @{s.username} {s.email && `• ${s.email}`}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditUserId(s.id)}
                      className="px-2.5 py-1.5 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit & Perms</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── TAB 3: DELIVERIES & RESULTS ── */}
      {activeTab === 'deliveries' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-ink/60">
              TEST DELIVERIES ({deliveries.length})
            </span>
          </div>

          {isLoadingDeliveries ? (
            <div className="p-8 text-center text-xs text-ink/50 bg-surface border border-border rounded-card">
              Loading test deliveries...
            </div>
          ) : deliveries.length === 0 ? (
            <div className="p-8 text-center bg-surface border border-dashed border-border rounded-card text-xs text-ink/60">
              No examination deliveries found for this school.
            </div>
          ) : (
            deliveries.map((d, idx) => (
              <div
                key={d.id}
                style={getStaggerDelay(idx, true)}
                className="p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading font-bold text-sm text-ink truncate">
                    {d.paper_title || 'Institutional Question Paper'}
                  </span>
                  <span
                    className={`pill text-[10px] py-0.5 shrink-0 ${
                      d.mode === 'ONLINE' ? 'pill-lime' : 'pill-muted'
                    }`}
                  >
                    {d.mode}
                  </span>
                </div>

                <div className="text-xs text-ink/60 font-mono">
                  Ver. {d.version_label} • {d.total_marks} Marks • {d.assigned_students?.length || 0} candidates
                </div>

                <div className="pt-2 border-t border-border/50 flex justify-end">
                  {d.mode === 'ONLINE' ? (
                    <Link
                      to={`/deliveries/${d.id}/results`}
                      className="px-3.5 py-1.5 rounded-pill bg-ember text-white text-xs font-heading font-semibold flex items-center gap-1.5 shadow-xs"
                    >
                      <span>Results Roster</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : (
                    <Link
                      to={`/papers/${d.paper_id || 1}/versions/${d.paper_version}/print`}
                      className="px-3.5 py-1.5 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold"
                    >
                      Print Layout →
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Student Enrollment Drawer */}
      <CreateUserDrawer
        isOpen={isCreateStudentOpen}
        onClose={() => setIsCreateStudentOpen(false)}
        targetProfile="student"
        onUserCreated={() => {
          setIsCreateStudentOpen(false);
          fetchUsers();
        }}
      />

      {/* Update User & Permission Management Modal */}
      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => fetchUsers()}
      />
    </div>
  );
};
