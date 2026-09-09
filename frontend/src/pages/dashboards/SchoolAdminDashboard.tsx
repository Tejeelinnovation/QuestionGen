import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../../api/users';
import { papersApi } from '../../api/papers';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SchoolAdminDashboardTablet } from '../tablet/dashboards/SchoolAdminDashboardTablet';
import { SchoolAdminDashboardMobile } from '../mobile/dashboards/SchoolAdminDashboardMobile';
import { getStaggerDelay, MOTION } from '../../lib/motion';
import { UpdateUserModal } from '../../components/users/UpdateUserModal';
import { CreateUserDrawer } from '../../components/users/CreateUserDrawer';
import {
  Edit2,
  Users,
  GraduationCap,
  FileSpreadsheet,
  Plus,
  Search,
  ExternalLink,
} from 'lucide-react';
import type { User, Delivery } from '../../types';
import { Pagination } from '../../components/ui/pagination';

type ActiveTab = 'teachers' | 'students' | 'deliveries';

const SchoolAdminDashboardDesktop: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('teachers');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Pagination states
  const [studentPage, setStudentPage] = useState<number>(1);
  const studentPageSize = 9;
  const [teacherPage, setTeacherPage] = useState<number>(1);
  const teacherPageSize = 6;
  const [deliveryPage, setDeliveryPage] = useState<number>(1);
  const deliveryPageSize = 6;

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
      const data = await usersApi.getAllUsers();
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
      console.warn('Failed to load school deliveries:', err);
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
  const students = users.filter((u) => u.role_label === 'Student');

  const filteredStudents = students.filter((s) => {
    const term = studentSearch.toLowerCase().trim();
    if (!term) return true;
    const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
    return (
      s.username.toLowerCase().includes(term) ||
      name.includes(term) ||
      (s.email && s.email.toLowerCase().includes(term))
    );
  });

  const paginatedStudents = filteredStudents.slice(
    (studentPage - 1) * studentPageSize,
    studentPage * studentPageSize
  );

  const paginatedTeachers = teachers.slice(
    (teacherPage - 1) * teacherPageSize,
    teacherPage * teacherPageSize
  );

  const paginatedDeliveries = deliveries.slice(
    (deliveryPage - 1) * deliveryPageSize,
    deliveryPage * deliveryPageSize
  );

  return (
    <div className="space-y-8 font-body">
      {/* ── Top Typographic Headline with embedded stats ── */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-ember">
            <span className="w-2 h-2 rounded-full bg-ember" />
            School Administration
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Institutional Control Center
          </h1>
          <p className="font-body text-ink/75 text-base max-w-2xl leading-relaxed">
            Directing{' '}
            <span className="font-heading font-bold text-ember text-lg underline decoration-ember/40 underline-offset-2">
              {teachers.length} certified teachers
            </span>
            ,{' '}
            <span className="font-heading font-bold text-forest text-lg underline decoration-forest/40 underline-offset-2">
              {students.length} enrolled students
            </span>
            , and{' '}
            <span className="font-heading font-bold text-grape text-lg underline decoration-grape/40 underline-offset-2">
              {deliveries.length} test deliveries
            </span>{' '}
            across your school.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchUsers();
              fetchDeliveries();
            }}
            disabled={isLoading || isLoadingDeliveries}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-ink hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading || isLoadingDeliveries ? 'Refreshing...' : '↻ Refresh Data'}
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('teachers')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer ${
            activeTab === 'teachers'
              ? 'bg-ember text-white shadow-sm'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Faculty & Teachers ({teachers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer ${
            activeTab === 'students'
              ? 'bg-forest text-white shadow-sm'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Student Body ({students.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deliveries')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer ${
            activeTab === 'deliveries'
              ? 'bg-grape text-white shadow-sm'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Test Deliveries & Results ({deliveries.length})</span>
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── TAB 1: FACULTY & TEACHERS ── */}
      {activeTab === 'teachers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Stacked Teacher Cards */}
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
                {paginatedTeachers.map((t, idx) => {
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
                            <span>Edit & Permissions</span>
                          </button>
                          <span className="hidden sm:inline-block font-mono text-xs font-semibold px-2.5 py-1 rounded-pill bg-bg border border-border text-ink/70">
                            {t.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <Pagination
                  currentPage={teacherPage}
                  totalCount={teachers.length}
                  pageSize={teacherPageSize}
                  onPageChange={setTeacherPage}
                  itemName="teachers"
                />
              </div>
            )}
          </div>

          {/* Right: Sticky "Create New Teacher" Onboarding Form */}
          <div className="lg:col-span-5 sticky top-24">
            <div className="bg-surface border border-border rounded-lg p-6 sm:p-7 shadow-card space-y-5">
              <div className="border-b border-border pb-4">
                <div className="flex items-center gap-2 text-ember mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-ember" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                    Provision Credentials
                  </span>
                </div>
                <h3 className="font-heading font-bold text-xl text-ink">
                  Register New Teacher
                </h3>
                <p className="text-xs text-ink/70 mt-1 leading-relaxed">
                  Provision new faculty member credentials scoped to your institution.
                </p>
              </div>

              {formSuccess && (
                <div className="rounded-card border border-forest/30 bg-forest/10 text-forest p-3.5 text-xs font-medium">
                  {formSuccess}
                </div>
              )}

              {formError && (
                <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3.5 text-xs font-medium">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateTeacher} className="space-y-4 font-body">
                <div>
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-username">
                    Username *
                  </label>
                  <input
                    id="t-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isCreating}
                    placeholder="e.g. jdoe_math"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-password">
                    Temporary Password *
                  </label>
                  <input
                    id="t-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isCreating}
                    placeholder="••••••••"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-firstname">
                      First Name
                    </label>
                    <input
                      id="t-firstname"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={isCreating}
                      placeholder="First name"
                      className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1" htmlFor="t-lastname">
                      Last Name
                    </label>
                    <input
                      id="t-lastname"
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
      )}

      {/* ── TAB 2: STUDENT BODY ── */}
      {activeTab === 'students' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
            <div className="space-y-1">
              <h2 className="font-heading font-bold text-xl text-ink">
                Enrolled Students
              </h2>
              <p className="text-xs text-ink/70">
                Manage candidate accounts, credentials, and test permissions across your school.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setStudentPage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-pill border border-border bg-surface text-ink focus:outline-none focus:border-forest w-48 sm:w-60"
                />
              </div>

              <button
                type="button"
                id="schooladmin-create-student-btn"
                onClick={() => setIsCreateStudentOpen(true)}
                className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Enroll Student</span>
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60">
              Loading student roster...
            </div>
          )}

          {!isLoading && filteredStudents.length === 0 && (
            <div className="bg-surface border-2 border-dashed border-border rounded-lg p-10 text-center space-y-3">
              <span className="pill pill-forest text-xs">No Students Found</span>
              <h3 className="font-heading font-bold text-lg text-ink">
                {studentSearch ? 'No matching students' : 'No Students Enrolled Yet'}
              </h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto">
                {studentSearch
                  ? 'Try adjusting your search criteria.'
                  : 'Enroll student candidates into your institution to assign examination deliveries.'}
              </p>
              {!studentSearch && (
                <button
                  type="button"
                  onClick={() => setIsCreateStudentOpen(true)}
                  className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all cursor-pointer"
                >
                  + Enroll First Student
                </button>
              )}
            </div>
          )}

          {!isLoading && filteredStudents.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedStudents.map((s, idx) => {
                  const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');

                  return (
                    <div
                      key={s.id}
                      style={getStaggerDelay(idx)}
                      className="bg-surface border border-border rounded-card p-4 shadow-card hover:border-border-strong space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="pill pill-lime text-[10px]">
                            Student #{s.id}
                          </span>
                          <span className="font-mono text-[11px] text-ink/50">
                            @{s.username}
                          </span>
                        </div>

                        <h3 className="font-heading font-bold text-base text-ink">
                          {fullName || s.username}
                        </h3>

                        <div className="text-xs text-ink/60 font-mono truncate">
                          {s.email || 'No email recorded'}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-between">
                        <span className="font-mono text-[11px] text-ink/50">
                          {s.is_active ? 'Active' : 'Disabled'}
                        </span>

                        <button
                          type="button"
                          id={`edit-student-${s.id}`}
                          onClick={() => setEditUserId(s.id)}
                          className="px-3 py-1 text-xs font-heading font-semibold rounded-pill border border-border bg-bg text-ink hover:bg-forest hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit & Permissions</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                currentPage={studentPage}
                totalCount={filteredStudents.length}
                pageSize={studentPageSize}
                onPageChange={setStudentPage}
                itemName="students"
              />
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: DELIVERIES & RESULTS ── */}
      {activeTab === 'deliveries' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="space-y-1">
              <h2 className="font-heading font-bold text-xl text-ink">
                School Examination Deliveries
              </h2>
              <p className="text-xs text-ink/70">
                Inspect cross-faculty test deliveries, candidate participation, and access results rosters.
              </p>
            </div>

            <span className="font-mono text-xs text-ink/60 bg-surface px-2.5 py-1 rounded-pill border border-border">
              {deliveries.length} Total Deliveries
            </span>
          </div>

          {isLoadingDeliveries && (
            <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60">
              Loading school examination deliveries...
            </div>
          )}

          {!isLoadingDeliveries && deliveries.length === 0 && (
            <div className="bg-surface border-2 border-dashed border-border rounded-lg p-10 text-center space-y-3">
              <span className="pill pill-grape text-xs">No Deliveries Found</span>
              <h3 className="font-heading font-bold text-lg text-ink">No Test Deliveries Scheduled</h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto">
                When teachers deploy question papers as online or physical tests, they will appear here with student result scorecards.
              </p>
            </div>
          )}

          {!isLoadingDeliveries && deliveries.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-3">
                {paginatedDeliveries.map((d, idx) => (
                  <div
                    key={d.id}
                    style={getStaggerDelay(idx)}
                    className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${MOTION.hoverLift.className}`}
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">
                          Delivery #{d.id}
                        </span>
                        <span
                          className={`pill text-[10px] ${
                            d.mode === 'ONLINE' ? 'pill-lime' : 'pill-muted'
                          }`}
                        >
                          {d.mode}
                        </span>
                        <span className="pill pill-muted text-[10px]">
                          Ver. {d.version_label}
                        </span>
                        <span className="text-xs text-ink/50 font-mono">
                          Max Marks: {d.total_marks}
                        </span>
                      </div>

                      <h3 className="font-heading font-bold text-base text-ink">
                        {d.paper_title || 'Institutional Question Paper'}
                      </h3>

                      <div className="text-xs text-ink/65 font-mono">
                        {d.assigned_students?.length || 0} candidates assigned • Scheduled {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {d.mode === 'ONLINE' ? (
                        <Link
                          to={`/deliveries/${d.id}/results`}
                          id={`delivery-results-btn-${d.id}`}
                          className="px-4 py-2 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <span>View Results Roster</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <Link
                          to={`/papers/${d.paper_id || 1}/versions/${d.paper_version}/print`}
                          className="px-4 py-2 rounded-pill border border-border bg-bg text-ink font-heading font-semibold text-xs hover:bg-surface-muted transition-all"
                        >
                          View Print Layout →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Pagination
                currentPage={deliveryPage}
                totalCount={deliveries.length}
                pageSize={deliveryPageSize}
                onPageChange={setDeliveryPage}
                itemName="deliveries"
              />
            </div>
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

      {/* User Update & Permission Management Modal */}
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
