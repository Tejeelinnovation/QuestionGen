import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { usersApi } from '../../../api/users';
import { papersApi } from '../../../api/papers';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { BulkImportModal } from '../../../components/schools/BulkImportModal';
import { PhoneInput } from '../../../components/ui/phone-input';
import { ClassManagementView } from '../../../components/schools/ClassManagementView';
import {
  Edit2,
  Users,
  GraduationCap,
  FileSpreadsheet,
  BookOpen,
  Plus,
  Search,
  ExternalLink,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { User, Delivery, School } from '../../../types';
import { Pagination } from '../../../components/ui/pagination';
import {
  SkeletonFacultyRoster,
  SkeletonStudentGrid,
  SkeletonDeliveriesList,
} from '../../../components/ui/skeleton';

type ActiveTab = 'teachers' | 'students' | 'classes' | 'deliveries';

export const SchoolAdminDashboardTablet: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('teachers');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportRole, setBulkImportRole] = useState<'student' | 'teacher'>('student');
  const [studentSearch, setStudentSearch] = useState('');
  const [schoolData, setSchoolData] = useState<School | null>(null);

  // Pagination states
  const [teacherPage, setTeacherPage] = useState(1);
  const teacherPageSize = 8;
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(10);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const deliveryPageSize = 6;

  // Create Faculty form state
  const [targetProfile, setTargetProfile] = useState<'teacher' | 'deo' | 'validator' | 'deo_validator'>('teacher');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [primarySubject, setPrimarySubject] = useState('');
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
      console.warn('Failed to load deliveries on tablet:', err);
    } finally {
      setIsLoadingDeliveries(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDeliveries();
  }, []);

  useEffect(() => {
    if (currentUser?.school) {
      usersApi
        .getSchool(currentUser.school)
        .then(setSchoolData)
        .catch(() => {});
    }
  }, [currentUser?.school]);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!username.trim() || !password.trim()) {
      setFormError('Username and password are required.');
      return;
    }

    if (!email.trim()) {
      setFormError('Email address is compulsory.');
      return;
    }

    const mobDigits = mobileNumber.replace(/\D/g, '');
    const isTenDigits = mobDigits.length === 10 || (mobDigits.length === 12 && mobDigits.startsWith('91'));
    if (!mobileNumber.trim() || !isTenDigits) {
      setFormError('A valid 10-digit Indian mobile number (+91) is compulsory.');
      return;
    }

    setIsCreating(true);
    try {
      const newUser = await usersApi.createUser({
        username: username.trim(),
        password: password.trim(),
        profile: targetProfile,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim(),
        mobile_number: mobileNumber.startsWith('+91') ? mobileNumber : `+91${mobDigits.slice(-10)}`,
        primary_subject: targetProfile === 'teacher' ? (primarySubject.trim() || undefined) : undefined,
      });

      const roleDisplay =
        targetProfile === 'deo'
          ? 'Data Entry Operator'
          : targetProfile === 'validator'
          ? 'Validator'
          : targetProfile === 'deo_validator'
          ? 'DEO & Validator'
          : 'Teacher';

      setFormSuccess(`${roleDisplay} "${newUser.username}" created successfully.`);
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setMobileNumber('');
      setPrimarySubject('');
      setTargetProfile('teacher');
      fetchUsers();
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to create account.';
      setFormError(detail);
    } finally {
      setIsCreating(false);
    }
  };

  const teachers = users.filter((u) =>
    ['Teacher', 'Data Entry Operator', 'Validator', 'DEO & Validator'].includes(u.role_label)
  );
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

  const paginatedTeachers = teachers.slice(
    (teacherPage - 1) * teacherPageSize,
    teacherPage * teacherPageSize
  );

  const paginatedStudents = filteredStudents.slice(
    (studentPage - 1) * studentPageSize,
    studentPage * studentPageSize
  );

  const paginatedDeliveries = deliveries.slice(
    (deliveryPage - 1) * deliveryPageSize,
    deliveryPage * deliveryPageSize
  );

  return (
    <div className="space-y-6 font-body pb-12">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-ember">
            <span className="w-2 h-2 rounded-full bg-ember" />
            Institutional Scope • Tablet
          </div>
          <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
            School Administration
          </h1>
          <p className="text-xs text-ink/75 leading-relaxed">
            Manage teacher onboarding, student candidate enrollment, and examination test results.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setBulkImportRole(activeTab === 'students' ? 'student' : 'teacher');
              setIsBulkImportOpen(true);
            }}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm min-h-[40px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Bulk Import</span>
          </button>

          <button
            onClick={() => {
              fetchUsers();
              fetchDeliveries();
            }}
            disabled={isLoading || isLoadingDeliveries}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer min-h-[40px]"
          >
            {isLoading || isLoadingDeliveries ? 'Refreshing...' : '↻ Refresh Data'}
          </button>
        </div>
      </div>

      {/* ── Segmented Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('teachers')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-heading font-semibold rounded-pill transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'teachers'
              ? 'bg-ember text-white shadow-sm'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Faculty ({teachers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-heading font-semibold rounded-pill transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'students'
              ? 'bg-forest text-white shadow-sm'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Students ({students.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('classes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-heading font-semibold rounded-pill transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'classes'
              ? 'bg-lime text-ink shadow-sm font-bold'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Classes & Divisions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deliveries')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-heading font-semibold rounded-pill transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'deliveries'
              ? 'bg-grape text-white shadow-sm'
              : 'text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Deliveries & Results ({deliveries.length})</span>
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── TAB 1: TEACHERS ── */}
      {activeTab === 'teachers' && (
        <div className="space-y-6">
          {/* Quick Onboarding Form */}
          <div className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4">
            <h3 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-ember" />
              <span>{schoolData?.validation_workflow_enabled ? 'Register New Faculty' : 'Register New Teacher'}</span>
            </h3>

            {formSuccess && (
              <div className="p-3 rounded-card bg-forest/10 border border-forest/30 text-forest text-xs font-medium">
                {formSuccess}
              </div>
            )}

            {formError && (
              <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateTeacher} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schoolData?.validation_workflow_enabled && (
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-[11px] font-heading font-semibold uppercase text-ink">
                    Account Responsibility Profile *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetProfile('teacher')}
                      className={`p-2.5 rounded-card border text-left transition-all cursor-pointer ${
                        targetProfile === 'teacher'
                          ? 'border-forest bg-forest/5 text-forest font-semibold shadow-xs'
                          : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                      }`}
                    >
                      <span className="block text-xs">Teacher</span>
                      <span className="block text-[10px] text-ink/50 mt-0.5">Authoring & Exam Prep</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetProfile('deo')}
                      className={`p-2.5 rounded-card border text-left transition-all cursor-pointer ${
                        targetProfile === 'deo'
                          ? 'border-forest bg-forest/5 text-forest font-semibold shadow-xs'
                          : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                      }`}
                    >
                      <span className="block text-xs">DEO</span>
                      <span className="block text-[10px] text-ink/50 mt-0.5">Data Entry Operator</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetProfile('validator')}
                      className={`p-2.5 rounded-card border text-left transition-all cursor-pointer ${
                        targetProfile === 'validator'
                          ? 'border-forest bg-forest/5 text-forest font-semibold shadow-xs'
                          : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                      }`}
                    >
                      <span className="block text-xs">Validator</span>
                      <span className="block text-[10px] text-ink/50 mt-0.5">Review & Metadata</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetProfile('deo_validator')}
                      className={`p-2.5 rounded-card border text-left transition-all cursor-pointer ${
                        targetProfile === 'deo_validator'
                          ? 'border-forest bg-forest/5 text-forest font-semibold shadow-xs'
                          : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                      }`}
                    >
                      <span className="block text-xs">Dual Role</span>
                      <span className="block text-[10px] text-ink/50 mt-0.5">DEO & Validator</span>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-heading font-semibold uppercase text-ink mb-1" htmlFor="tab-t-username">
                  Username *
                </label>
                <input
                  id="tab-t-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isCreating}
                  placeholder="e.g. jsmith_math"
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-heading font-semibold uppercase text-ink mb-1" htmlFor="tab-t-password">
                  Temporary Password *
                </label>
                <div className="relative">
                  <input
                    id="tab-t-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isCreating}
                    placeholder="••••••••"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 pr-9 text-xs text-ink focus:outline-none focus:border-forest"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={isCreating}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-heading font-semibold uppercase text-ink mb-1" htmlFor="tab-t-first">
                  First Name
                </label>
                <input
                  id="tab-t-first"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isCreating}
                  placeholder="First name"
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-heading font-semibold uppercase text-ink mb-1" htmlFor="tab-t-last">
                  Last Name
                </label>
                <input
                  id="tab-t-last"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isCreating}
                  placeholder="Last name"
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-heading font-semibold uppercase text-ink mb-1" htmlFor="tab-t-email">
                  Email Address *
                </label>
                <input
                  id="tab-t-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isCreating}
                  placeholder="teacher@school.edu"
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <PhoneInput
                  id="tab-t-mobile"
                  label="Mobile Number"
                  required={true}
                  value={mobileNumber}
                  onChange={setMobileNumber}
                  disabled={isCreating}
                  placeholder="98765 43210"
                />
              </div>

              {targetProfile === 'teacher' && (
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-heading font-semibold uppercase text-ink mb-1" htmlFor="tab-t-subject">
                    Primary Teaching Subject
                  </label>
                  <input
                    id="tab-t-subject"
                    type="text"
                    value={primarySubject}
                    onChange={(e) => setPrimarySubject(e.target.value)}
                    disabled={isCreating}
                    placeholder="e.g. Mathematics, Science, English"
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:outline-none focus:border-forest"
                  />
                </div>
              )}

              <div className="sm:col-span-2 pt-1">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full py-2.5 px-4 rounded-pill bg-ember text-white text-xs font-heading font-semibold hover:bg-ember/90 transition-all min-h-[44px] cursor-pointer"
                >
                  {isCreating ? 'Provisioning Account...' : 'Confirm & Create Account →'}
                </button>
              </div>
            </form>
          </div>

          {/* Teacher Roster */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-ink">
                Faculty Members ({teachers.length})
              </h3>
              <button
                type="button"
                onClick={() => {
                  setBulkImportRole('teacher');
                  setIsBulkImportOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill bg-ember/10 border border-ember/30 text-ember hover:bg-ember hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Import Teachers (Excel)</span>
              </button>
            </div>

            {isLoading && (
              <SkeletonFacultyRoster count={4} />
            )}

            {!isLoading && teachers.length === 0 && (
              <div className="p-8 text-center bg-surface border border-dashed border-border rounded-card text-xs text-ink/60">
                No teachers registered yet.
              </div>
            )}

            {!isLoading && (
              <div className="space-y-3">
                {paginatedTeachers.map((t, idx) => {
                  const fullName = [t.first_name, t.last_name].filter(Boolean).join(' ');

                  return (
                    <div
                      key={t.id}
                      style={getStaggerDelay(idx)}
                      className={`p-4 rounded-card bg-surface border border-border shadow-xs flex items-center justify-between gap-4 ${MOTION.hoverLift.className}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`pill text-[10px] ${
                              t.role_label === 'Data Entry Operator'
                                ? 'pill-forest'
                                : t.role_label === 'Validator'
                                ? 'pill-grape'
                                : t.role_label === 'DEO & Validator'
                                ? 'pill-lime'
                                : 'pill-ember'
                            }`}
                          >
                            {t.role_label || 'Teacher'} #{t.id}
                          </span>
                          <span className="font-mono text-xs text-ink/60">
                            @{t.username}
                          </span>
                        </div>
                        <h4 className="font-heading font-bold text-base text-ink">
                          {fullName || t.username}
                        </h4>
                        {t.email && (
                          <div className="text-xs text-ink/60 font-mono">
                            ✉ {t.email}
                          </div>
                        )}
                        {t.mobile_number && (
                          <div className="text-xs text-ink/60 font-mono">
                            📞 {t.mobile_number}
                          </div>
                        )}
                        {t.primary_subject && (
                          <div className="pt-1">
                            <span className="pill text-[10px] bg-grape/10 text-grape border border-grape/20 font-medium">
                              📖 {t.primary_subject}
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditUserId(t.id)}
                        className="px-3.5 py-2 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold hover:bg-forest hover:text-white transition-colors flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit & Permissions</span>
                      </button>
                    </div>
                  );
                })}

                <Pagination
                  currentPage={teacherPage}
                  totalCount={teachers.length}
                  pageSize={teacherPageSize}
                  onPageChange={setTeacherPage}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: STUDENTS ── */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
            <div>
              <h3 className="font-heading font-bold text-lg text-ink">
                Enrolled Students
              </h3>
              <p className="text-xs text-ink/65">
                School-wide candidate enrollment and access control.
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
                  className="pl-8 pr-7 py-1.5 text-xs rounded-pill border border-border bg-surface text-ink focus:outline-none focus:border-forest w-48"
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSearch('');
                      setStudentPage(1);
                    }}
                    className="absolute right-2.5 top-2 p-0.5 rounded-full hover:bg-surface-muted text-ink/40 hover:text-ink transition-colors cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setBulkImportRole('student');
                  setIsBulkImportOpen(true);
                }}
                className="px-3.5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest/10 border border-forest/30 text-forest hover:bg-forest hover:text-white transition-all flex items-center gap-1.5 shadow-xs min-h-[40px] cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Import Students (Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreateStudentOpen(true)}
                className="px-4 py-2 rounded-pill bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all flex items-center gap-1.5 shadow-sm min-h-[40px] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Enroll Student</span>
              </button>
            </div>
          </div>

          {isLoading && (
            <SkeletonStudentGrid count={4} />
          )}

          {!isLoading && filteredStudents.length === 0 && (
            <div className="p-10 text-center bg-surface border border-dashed border-border rounded-card space-y-2">
              <p className="text-xs text-ink/60 font-medium">No students found.</p>
              <button
                type="button"
                onClick={() => setIsCreateStudentOpen(true)}
                className="px-4 py-2 rounded-pill bg-forest text-white text-xs font-heading font-semibold"
              >
                + Enroll First Student
              </button>
            </div>
          )}

          {!isLoading && filteredStudents.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {paginatedStudents.map((s, idx) => {
                  const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');

                  return (
                    <div
                      key={s.id}
                      style={getStaggerDelay(idx)}
                      className="p-4 rounded-card bg-surface border border-border shadow-xs flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="pill pill-lime text-[10px]">
                            Student #{s.id}
                          </span>
                          <span className="font-mono text-xs text-ink/50">
                            @{s.username}
                          </span>
                        </div>
                        <h4 className="font-heading font-bold text-base text-ink">
                          {fullName || s.username}
                        </h4>
                        <div className="text-xs text-ink/60 font-mono truncate">
                          {s.email || 'No email recorded'}
                        </div>
                        {s.mobile_number && (
                          <div className="text-xs text-ink/60 font-mono truncate">
                            📞 {s.mobile_number}
                          </div>
                        )}
                        {s.class_section_name && (
                          <div className="pt-1">
                            <span className="pill text-[10px] bg-forest/15 text-forest border border-forest/25 font-semibold">
                              Class {s.class_section_name}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-between">
                        <span className="text-[11px] font-mono text-ink/60">
                          {s.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditUserId(s.id)}
                          className="px-3 py-1.5 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold hover:bg-forest hover:text-white transition-colors flex items-center gap-1 cursor-pointer min-h-[36px]"
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
                onPageSizeChange={(newSize) => {
                  setStudentPageSize(newSize);
                  setStudentPage(1);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: CLASSES & DIVISIONS ── */}
      {activeTab === 'classes' && (
        <ClassManagementView faculty={teachers} />
      )}

      {/* ── TAB 4: DELIVERIES & RESULTS ── */}
      {activeTab === 'deliveries' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div>
              <h3 className="font-heading font-bold text-lg text-ink">
                School Test Deliveries
              </h3>
              <p className="text-xs text-ink/65">
                Inspect exam deliveries and access student results rosters.
              </p>
            </div>
            <span className="font-mono text-xs text-ink/60 bg-surface px-2.5 py-1 rounded-pill border border-border">
              {deliveries.length} Total
            </span>
          </div>

          {isLoadingDeliveries && (
            <SkeletonDeliveriesList count={3} />
          )}

          {!isLoadingDeliveries && deliveries.length === 0 && (
            <div className="p-10 text-center bg-surface border border-dashed border-border rounded-card text-xs text-ink/60">
              No examination deliveries scheduled yet.
            </div>
          )}

          {!isLoadingDeliveries && deliveries.length > 0 && (
            <div className="space-y-3">
              {paginatedDeliveries.map((d, idx) => (
                <div
                  key={d.id}
                  style={getStaggerDelay(idx)}
                  className="p-4 rounded-card bg-surface border border-border shadow-xs flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
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
                        {d.total_marks} Marks
                      </span>
                    </div>

                    <h4 className="font-heading font-bold text-base text-ink">
                      {d.paper_title || 'Institutional Question Paper'}
                    </h4>

                    <div className="text-xs text-ink/65 font-mono">
                      {d.assigned_students?.length || 0} candidates assigned
                    </div>
                  </div>

                  <div>
                    {d.mode === 'ONLINE' ? (
                      <Link
                        to={`/deliveries/${d.id}/results`}
                        className="px-4 py-2 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 transition-all flex items-center gap-1.5 shadow-sm min-h-[40px]"
                      >
                        <span>Results Roster</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to={`/papers/${d.paper_id || 1}/versions/${d.paper_version}/print`}
                        className="px-4 py-2 rounded-pill border border-border bg-bg text-ink font-heading font-semibold text-xs hover:bg-surface-muted transition-all min-h-[40px] flex items-center"
                      >
                        Print Layout →
                      </Link>
                    )}
                  </div>
                </div>
              ))}

              <Pagination
                currentPage={deliveryPage}
                totalCount={deliveries.length}
                pageSize={deliveryPageSize}
                onPageChange={setDeliveryPage}
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

      {/* Update User & Permission Management Modal */}
      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => fetchUsers()}
      />

      {/* Excel Bulk Provisioning Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImportSuccess={() => fetchUsers()}
        defaultRole={bulkImportRole}
      />
    </div>
  );
};
