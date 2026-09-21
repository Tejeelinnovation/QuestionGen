import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SuperAdminDashboardTablet } from '../tablet/dashboards/SuperAdminDashboardTablet';
import { SuperAdminDashboardMobile } from '../mobile/dashboards/SuperAdminDashboardMobile';
import { getStaggerDelay } from '../../lib/motion';
import { CreateSchoolDrawer } from '../../components/schools/CreateSchoolDrawer';
import { EditSchoolModal } from '../../components/schools/EditSchoolModal';
import { CreateUserDrawer } from '../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../components/users/UpdateUserModal';
import { BulkImportModal } from '../../components/schools/BulkImportModal';
import { Edit2, Building2, Search, Loader2, X, FileSpreadsheet, UserPlus, Users, ShieldAlert, Database } from 'lucide-react';
import type { User, School, UserStats } from '../../types';
import { Pagination } from '../../components/ui/pagination';
import { SkeletonRoleDeck, SkeletonTable, Skeleton } from '../../components/ui/skeleton';
import { SuperAdminAuditLogViewer } from '../../components/audit/SuperAdminAuditLogViewer';

const SuperAdminDashboardDesktop: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'logs'>('directory');
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isUpdatingUsers, setIsUpdatingUsers] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Drawer / modal states
  const [isCreateSchoolOpen, setIsCreateSchoolOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [createUserProfile, setCreateUserProfile] = useState<'teacher' | 'qbm' | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [bulkImportSchool, setBulkImportSchool] = useState<School | null>(null);

  // Debounce search term to server query (400ms pause)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchTerm);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchData = async () => {
    setIsUpdatingUsers(true);
    setErrorMessage(null);
    try {
      const [usersData, schoolsData, statsData] = await Promise.all([
        usersApi.getUsers({
          page: currentPage,
          page_size: pageSize,
          search: searchQuery.trim() || undefined,
          role: roleFilter !== 'ALL' ? roleFilter : undefined,
        }),
        usersApi.getSchools().catch(() => [] as School[]),
        usersApi.getUserStats().catch(() => null),
      ]);
      setUsers(usersData.results);
      setTotalUsersCount(usersData.count);
      setSchools(schoolsData);
      if (statsData) {
        setUserStats(statsData);
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load accounts directory from the server.'
      );
    } finally {
      setIsInitialLoading(false);
      setIsUpdatingUsers(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, pageSize, searchQuery, roleFilter]);

  const superAdminCount = userStats?.super_admin ?? users.filter((u) => u.role_label === 'Super Admin').length;
  const schoolAdminCount = userStats?.school_admin ?? users.filter((u) => u.role_label === 'School Admin').length;
  const teacherCount = userStats?.teacher ?? users.filter((u) => u.role_label === 'Teacher').length;
  const studentCount = userStats?.student ?? users.filter((u) => u.role_label === 'Student').length;
  const totalSystemAccounts = userStats?.total ?? totalUsersCount;

  return (
    <div className="space-y-10">
      {/* ── Top Typographic Headline with embedded stats & primary create triggers ── */}
      <div className="border-b border-border pb-6 space-y-4">
        <div className="space-y-2">
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
              {totalSystemAccounts} active system accounts
            </span>{' '}
            and{' '}
            <span className="font-heading font-bold text-ember text-lg underline decoration-ember/40 underline-offset-2">
              {schools.length} institutions
            </span>{' '}
            with full atomic capability governance.
          </p>
        </div>

        {/* Primary Action Buttons - Left aligned in a neat row */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link
            to="/dashboard/qbm"
            id="superadmin-qbm-engine-btn"
            className="px-3.5 py-2 text-xs font-heading font-semibold rounded-pill bg-[#0F766E] text-white hover:bg-[#0F766E]/90 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Question Bank (QBM) Engine</span>
          </Link>
          <button
            type="button"
            id="superadmin-create-school-btn"
            onClick={() => setIsCreateSchoolOpen(true)}
            className="px-3.5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Add School / Coaching Class & Admin</span>
          </button>
          <button
            type="button"
            id="superadmin-create-qbm-btn"
            onClick={() => setCreateUserProfile('qbm')}
            className="px-3.5 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-forest" />
            <span>Add QBM Staff</span>
          </button>
        </div>
      </div>

      {/* ── Mode Switcher Tab Navigation ── */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer ${
            activeTab === 'directory'
              ? 'bg-forest text-white shadow-2xs'
              : 'bg-surface border border-border text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Accounts & Institutions</span>
          <span className="pill pill-muted text-[10px] py-0 px-1.5 ml-1">
            {totalSystemAccounts}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-forest text-white shadow-2xs'
              : 'bg-surface border border-border text-ink/70 hover:text-ink hover:bg-surface-muted'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-ember" />
          <span>System & Proctoring Audit Logs</span>
          <span className="w-2 h-2 rounded-full bg-ember animate-pulse" />
        </button>
      </div>

      {activeTab === 'logs' && <SuperAdminAuditLogViewer />}

      {activeTab === 'directory' && (
        <>
          {isInitialLoading && (
            <div className="space-y-10" aria-label="Loading dashboard skeleton">
          <SkeletonRoleDeck />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 bg-surface border border-border rounded-lg p-6 shadow-card space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-48" radius="sm" />
                  <Skeleton className="h-3 w-64" radius="sm" />
                </div>
                <Skeleton className="h-6 w-24" radius="pill" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-8 w-64" radius="pill" />
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((k) => (
                    <Skeleton key={k} className="h-7 w-16" radius="pill" />
                  ))}
                </div>
              </div>
              <SkeletonTable rows={6} />
            </div>
            <div className="lg:col-span-4 bg-surface border border-border rounded-lg p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <Skeleton className="h-5 w-32" radius="sm" />
                <Skeleton className="h-6 w-16" radius="pill" />
              </div>
              <div className="space-y-3">
                {[0, 1, 2].map((k) => (
                  <Skeleton key={k} className="h-16 w-full" radius="card" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {!isInitialLoading && !errorMessage && (
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

            {/* Fanned Card Row - staggered Y offsets, unequal heights, rotation, flat saturated token colors */}
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
                  Total: {totalUsersCount} accounts
                </span>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <div className="relative flex-1 max-w-sm">
                  {isUpdatingUsers ? (
                    <Loader2 className="w-4 h-4 text-forest animate-spin absolute left-3 top-1/2 -translate-y-1/2" />
                  ) : (
                    <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  )}
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search username, name, email, school..."
                    className="w-full pl-9 pr-8 py-1.5 rounded-pill border border-border bg-bg text-xs font-body text-ink focus:outline-none focus:border-forest transition-colors"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                  {[
                    'ALL',
                    'Super Admin',
                    'School Admin',
                    'Teacher',
                    'Student',
                    'Question Bank Manager',
                    'Data Entry Operator',
                    'Validator',
                    'DEO & Validator',
                  ].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setRoleFilter(role);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-pill text-[11px] font-heading font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        roleFilter === role
                          ? 'bg-forest text-white shadow-xs'
                          : 'bg-surface border border-border text-ink hover:border-forest/50'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`overflow-x-auto transition-opacity duration-150 ${isUpdatingUsers ? 'opacity-60' : 'opacity-100'}`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-ink/60 font-mono uppercase tracking-wider">
                      <th className="py-3 px-3">UID</th>
                      <th className="py-3 px-3">Username</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">School ID</th>
                      <th className="py-3 px-3 text-center">Capabilities</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {users.map((u) => {
                      const isCurrentUser = Boolean(
                        currentUser && (
                          currentUser.id === u.id ||
                          (currentUser.username && u.username && currentUser.username.toLowerCase() === u.username.toLowerCase())
                        )
                      );
                      return (
                        <tr key={u.id} className={`hover:bg-bg/60 transition-colors ${isCurrentUser ? 'bg-forest/5' : ''}`}>
                          <td className="py-3 px-3 font-mono text-ink/70">#{u.id}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="font-heading font-semibold text-ink text-sm">
                                {u.first_name || u.last_name
                                  ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                                  : u.username}
                              </div>
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.2 rounded-pill bg-forest/15 border border-forest/30 text-forest text-[9px] font-bold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-ink/60 font-mono flex items-center gap-1.5 flex-wrap">
                              <span className={isCurrentUser ? 'text-forest font-semibold' : ''}>@{u.username}</span>
                              {u.email && <span>• {u.email}</span>}
                              {u.mobile_number && <span className="text-forest font-medium">• {u.mobile_number}</span>}
                            </div>
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
                        <td className="py-3 px-3 text-center">
                          <span className="font-mono font-semibold bg-surface-muted border border-border px-2 py-0.5 rounded-sm">
                            {u.capabilities?.length || 0} caps
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            id={`edit-user-${u.id}`}
                            onClick={() => setEditUserId(u.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white transition-all font-heading font-semibold text-[11px] cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center space-y-2 text-ink/60">
                            <span className="font-heading font-semibold text-sm text-ink">
                              No accounts found matching your query
                            </span>
                            <p className="text-xs text-ink/50 max-w-sm">
                              {searchTerm || roleFilter !== 'ALL'
                                ? 'Try clearing your search terms or selecting "All Roles".'
                                : 'No user accounts are registered yet.'}
                            </p>
                            {(searchTerm || roleFilter !== 'ALL') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchTerm('');
                                  setSearchQuery('');
                                  setRoleFilter('ALL');
                                  setCurrentPage(1);
                                }}
                                className="mt-2 px-3 py-1 rounded-pill text-xs font-heading font-semibold bg-forest text-white hover:bg-forest/90 transition-colors cursor-pointer"
                              >
                                Reset Filters & Search
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Conditional Responsive Pagination */}
              <Pagination
                currentPage={currentPage}
                totalCount={totalUsersCount}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                itemName="accounts"
              />
            </div>

            {/* Right narrow column: Schools Infrastructure Panel (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-surface border border-border rounded-lg p-6 shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <span className="pill pill-forest text-[10px] mb-1">Tenant Clusters</span>
                    <h3 className="font-heading font-bold text-lg text-ink">
                      Schools & Coaching Classes
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreateSchoolOpen(true)}
                    className="px-2.5 py-1 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors cursor-pointer"
                  >
                    + New
                  </button>
                </div>

                {/* Schools List */}
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto">
                  {schools.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-card bg-bg border border-border hover:border-border-strong transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-heading font-semibold text-xs text-ink truncate">
                          {s.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            id={`import-school-${s.id}`}
                            onClick={() => setBulkImportSchool(s)}
                            className="p-1 rounded-sm text-ink/50 hover:text-forest hover:bg-forest/10 transition-colors cursor-pointer"
                            title="Excel Bulk Import (Students / Teachers)"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-forest" />
                          </button>
                          <button
                            type="button"
                            id={`edit-school-${s.id}`}
                            onClick={() => setEditingSchool(s)}
                            className="p-1 rounded-sm text-ink/50 hover:text-forest hover:bg-forest/10 transition-colors cursor-pointer"
                            title="Edit Student & Teacher Quota and Q-Bank Access"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-[10px] text-ink/50 bg-surface px-1.5 py-0.5 rounded-sm">
                            #{s.id}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-ink/65 font-mono">
                        <span>Board: {s.config?.board || 'Standard'}</span>
                        <span>•</span>
                        <span>{s.config?.curriculum || 'NCERT'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="pill text-[10px] bg-forest/10 text-forest border border-forest/20">
                          Students: {s.student_count ?? 0} / {s.max_students ?? 500}
                        </span>
                        <span className="pill text-[10px] bg-grape/10 text-grape border border-grape/20">
                          Teachers: {s.teacher_count ?? 0} / {s.max_teachers ?? 50}
                        </span>
                        <span
                          className={`pill text-[10px] ${
                            s.question_bank_enabled
                              ? 'bg-sky-500/10 text-sky-700 border border-sky-500/20 font-medium'
                              : 'bg-ink/5 text-ink/45 border border-border'
                          }`}
                        >
                          Q-Bank: {s.question_bank_enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  ))}

                  {schools.length === 0 && (
                    <div className="p-6 text-center text-xs text-ink/50 italic bg-bg rounded-card border border-border">
                      No schools registered yet.
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-3 border-t border-border text-xs text-ink/80">
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-ink/60">Tenant Isolation</span>
                    <span className="font-mono font-semibold text-forest">ENFORCED</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-ink/60">Capability RBAC</span>
                    <span className="font-mono font-semibold text-forest">ACTIVE</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-ink/60">Total Institutions</span>
                    <span className="font-mono font-semibold text-ink">{schools.length} registered</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </>
      )}
        </>
      )}

      {/* ── Modals & Drawers ── */}
      <CreateSchoolDrawer
        isOpen={isCreateSchoolOpen}
        onClose={() => setIsCreateSchoolOpen(false)}
        onSchoolCreated={() => {
          fetchData();
        }}
      />

      <EditSchoolModal
        school={editingSchool}
        isOpen={editingSchool !== null}
        onClose={() => setEditingSchool(null)}
        onSchoolUpdated={() => {
          fetchData();
        }}
      />

      {createUserProfile && (
        <CreateUserDrawer
          isOpen={true}
          targetProfile={createUserProfile}
          onClose={() => setCreateUserProfile(null)}
          onUserCreated={() => {
            fetchData();
          }}
        />
      )}

      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => {
          fetchData();
        }}
      />

      <BulkImportModal
        isOpen={bulkImportSchool !== null}
        onClose={() => setBulkImportSchool(null)}
        schoolId={bulkImportSchool?.id}
        schoolName={bulkImportSchool?.name}
        initialRole="student"
        onSuccess={() => {
          fetchData();
        }}
      />
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
