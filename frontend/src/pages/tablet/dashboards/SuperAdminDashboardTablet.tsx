import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { CreateSchoolDrawer } from '../../../components/schools/CreateSchoolDrawer';
import { EditSchoolModal } from '../../../components/schools/EditSchoolModal';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { BulkImportModal } from '../../../components/schools/BulkImportModal';
import { Plus, Edit2, Building2, Search, Loader2, X, FileSpreadsheet } from 'lucide-react';
import type { User, School, UserStats } from '../../../types';
import { Pagination } from '../../../components/ui/pagination';
import { SkeletonRoleDeck, SkeletonRoster, Skeleton } from '../../../components/ui/skeleton';

export const SuperAdminDashboardTablet: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(12);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isUpdatingUsers, setIsUpdatingUsers] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateSchoolOpen, setIsCreateSchoolOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [createUserProfile, setCreateUserProfile] = useState<'teacher' | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [bulkImportSchool, setBulkImportSchool] = useState<School | null>(null);

  // Debounce search query (400ms pause)
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
        err.response?.data?.detail || 'Failed to load user accounts from server.'
      );
    } finally {
      setIsInitialLoading(false);
      setIsUpdatingUsers(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, pageSize, searchQuery, roleFilter]);

  const roleDeck = [
    {
      title: 'Super Admins',
      count: userStats?.super_admin ?? users.filter((u) => u.role_label === 'Super Admin').length,
      scope: 'Global Scope',
      accent: 'forest',
      badgeClass: 'pill-lime',
      cardClass: 'bg-forest text-white',
      subtext: 'Global tenant controllers with root capabilities across all institutions.',
    },
    {
      title: 'School Admins',
      count: userStats?.school_admin ?? users.filter((u) => u.role_label === 'School Admin').length,
      scope: 'Institutional Scope',
      accent: 'ember',
      badgeClass: 'pill-ember',
      cardClass: 'bg-surface text-ink border border-border',
      subtext: 'School-level operators managing teacher rosters and examinations.',
    },
    {
      title: 'Teachers',
      count: userStats?.teacher ?? users.filter((u) => u.role_label === 'Teacher').length,
      scope: 'Pedagogical Scope',
      accent: 'grape',
      badgeClass: 'pill-grape',
      cardClass: 'bg-surface text-ink border border-border',
      subtext: 'Content authors drafting questions, assembling papers, and grading.',
    },
    {
      title: 'Students',
      count: userStats?.student ?? users.filter((u) => u.role_label === 'Student').length,
      scope: 'Candidate Scope',
      accent: 'lime',
      badgeClass: 'pill-lime',
      cardClass: 'bg-surface text-ink border border-border',
      subtext: 'Enrolled students sitting for online test deliveries and assessments.',
    },
  ];

  return (
    <div className="space-y-8 font-body">
      {/* ── Tablet Header Bar ── */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Global Control • Tablet
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-ink tracking-tight">
            Institutional Roster
          </h1>
          <p className="text-xs text-ink/70">
            Managing {users.length} accounts across {schools.length} institutions
          </p>
        </div>

        {/* Primary Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateSchoolOpen(true)}
            className="px-3 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>School & Admin</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateUserProfile('teacher')}
            className="px-3 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Teacher</span>
          </button>
        </div>
      </div>

      {isInitialLoading && (
        <div className="space-y-6" aria-label="Loading tablet dashboard skeleton">
          <SkeletonRoleDeck />
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <Skeleton className="h-6 w-48" radius="sm" />
              <Skeleton className="h-5 w-20" radius="pill" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-8 w-60" radius="pill" />
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((k) => (
                  <Skeleton key={k} className="h-7 w-16" radius="pill" />
                ))}
              </div>
            </div>
            <SkeletonRoster count={6} />
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
          {/* ── 4-Card 2x2 Grid for Role Breakdown ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink/60">
                // Role Directory Breakdown
              </span>
              <span className="text-xs text-ink/50">{userStats?.total ?? totalUsersCount} Total Users</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {roleDeck.map((role, idx) => (
                <div
                  key={role.title}
                  style={getStaggerDelay(idx)}
                  className={`animate-card-enter rounded-card p-5 shadow-card flex flex-col justify-between min-h-[160px] ${MOTION.touch.card.className} ${role.cardClass}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`pill text-[10px] ${role.badgeClass}`}>
                        {role.scope}
                      </span>
                      <span className="font-heading font-bold text-2xl">
                        {role.count}
                      </span>
                    </div>
                    <h3 className="font-heading font-bold text-lg leading-tight">
                      {role.title}
                    </h3>
                  </div>
                  <p className="text-xs opacity-75 leading-relaxed mt-2 line-clamp-2">
                    {role.subtext}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Registered Institutions Grid (Tablet) ── */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-forest" />
                <h2 className="font-heading font-bold text-lg text-ink">
                  Registered Institutions ({schools.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateSchoolOpen(true)}
                className="px-2.5 py-1 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors cursor-pointer"
              >
                + New School
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schools.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-card bg-surface border border-border hover:border-forest/40 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-semibold text-xs text-ink truncate">
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        id={`tablet-import-school-${s.id}`}
                        onClick={() => setBulkImportSchool(s)}
                        className="p-1 rounded-sm text-ink/60 hover:text-forest hover:bg-forest/10 transition-colors cursor-pointer"
                        title="Excel Bulk Import (Students / Teachers)"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-forest" />
                      </button>
                      <button
                        type="button"
                        id={`tablet-edit-school-${s.id}`}
                        onClick={() => setEditingSchool(s)}
                        className="p-1 rounded-sm text-ink/60 hover:text-forest hover:bg-forest/10 transition-colors cursor-pointer"
                        title="Edit Quotas"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-[10px] text-ink/50 bg-bg px-1.5 py-0.5 rounded-sm">
                        #{s.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-ink/65 font-mono">
                    <span>Board: {s.config?.board || 'Standard'}</span>
                    <span>•</span>
                    <span>{s.config?.curriculum || 'NCERT'}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="pill text-[10px] bg-forest/10 text-forest border border-forest/20">
                      Students: {s.student_count ?? 0} / {s.max_students ?? 500}
                    </span>
                    <span className="pill text-[10px] bg-grape/10 text-grape border border-grape/20">
                      Teachers: {s.teacher_count ?? 0} / {s.max_teachers ?? 50}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 2-Column Grid for User Directory ── */}
          <section className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="font-heading font-bold text-xl text-ink">
                All Enrolled User Accounts
              </h2>
              <span className="pill pill-forest text-xs">
                {totalUsersCount} Accounts
              </span>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                {isUpdatingUsers ? (
                  <Loader2 className="w-4 h-4 text-forest animate-spin absolute left-3 top-1/2 -translate-y-1/2" />
                ) : (
                  <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
                )}
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search accounts..."
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
                {['ALL', 'Super Admin', 'School Admin', 'Teacher', 'Student'].map((role) => (
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

            <div className={`grid grid-cols-2 gap-3.5 transition-opacity duration-150 ${isUpdatingUsers ? 'opacity-60' : 'opacity-100'}`}>
              {users.map((u) => {
                let rolePill = 'pill-muted';
                if (u.role_label === 'Super Admin') rolePill = 'pill-forest';
                if (u.role_label === 'School Admin') rolePill = 'pill-ember';
                if (u.role_label === 'Teacher') rolePill = 'pill-grape';
                if (u.role_label === 'Student') rolePill = 'pill-lime';

                return (
                  <div
                    key={u.id}
                    className="bg-surface border border-border rounded-card p-4 shadow-card space-y-2.5 active:scale-[0.99] transition-transform flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`pill text-[10px] ${rolePill}`}>
                          {u.role_label}
                        </span>
                        <span className="font-mono text-[11px] text-ink/40">#{u.id}</span>
                      </div>

                      <div>
                        <div className="font-heading font-bold text-sm text-ink truncate">
                          {u.first_name || u.last_name
                            ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                            : u.username}
                        </div>
                        <div className="font-mono text-[11px] text-ink/50 truncate">
                          @{u.username}
                        </div>
                        {u.email && (
                          <div className="text-[11px] text-ink/60 font-mono truncate">
                            {u.email}
                          </div>
                        )}
                        {u.mobile_number && (
                          <div className="text-[11px] text-forest font-mono font-medium truncate">
                            {u.mobile_number}
                          </div>
                        )}
                      </div>

                      {u.school_name && (
                        <div className="text-[11px] text-forest font-medium truncate pt-1 border-t border-border/60">
                          🏫 {u.school_name}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-[10px] font-mono text-ink/50">
                        {u.capabilities?.length || 0} caps
                      </span>
                      <button
                        type="button"
                        id={`tablet-edit-user-${u.id}`}
                        onClick={() => setEditUserId(u.id)}
                        className="px-3 py-1 rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white text-xs font-heading font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {users.length === 0 && (
              <div className="p-8 text-center bg-surface border border-border rounded-card text-ink/50 italic text-xs">
                No users found matching "{searchTerm || roleFilter}".
              </div>
            )}

            {/* Responsive Tablet Pagination */}
            <Pagination
              currentPage={currentPage}
              totalCount={totalUsersCount}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              itemName="accounts"
            />
          </section>
        </>
      )}

      {/* Modals & Drawers */}
      <CreateSchoolDrawer
        isOpen={isCreateSchoolOpen}
        onClose={() => setIsCreateSchoolOpen(false)}
        onSchoolCreated={() => fetchData()}
      />

      <EditSchoolModal
        school={editingSchool}
        isOpen={editingSchool !== null}
        onClose={() => setEditingSchool(null)}
        onSchoolUpdated={() => fetchData()}
      />

      {createUserProfile && (
        <CreateUserDrawer
          isOpen={true}
          targetProfile={createUserProfile}
          onClose={() => setCreateUserProfile(null)}
          onUserCreated={() => fetchData()}
        />
      )}

      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => fetchData()}
      />

      <BulkImportModal
        isOpen={bulkImportSchool !== null}
        onClose={() => setBulkImportSchool(null)}
        schoolId={bulkImportSchool?.id}
        schoolName={bulkImportSchool?.name}
        initialRole="student"
        onSuccess={() => fetchData()}
      />
    </div>
  );
};
