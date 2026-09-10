import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { CreateSchoolDrawer } from '../../../components/schools/CreateSchoolDrawer';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { ShieldCheck, Search, Plus, Edit2, Building2, Loader2, X } from 'lucide-react';
import type { User, School, UserStats } from '../../../types';
import { Pagination } from '../../../components/ui/pagination';
import { SkeletonRoleDeck, SkeletonRoster } from '../../../components/ui/skeleton';

export const SuperAdminDashboardMobile: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [schools, setSchools] = useState<School[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isUpdatingUsers, setIsUpdatingUsers] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  // Modals state
  const [isCreateSchoolOpen, setIsCreateSchoolOpen] = useState(false);
  const [createUserProfile, setCreateUserProfile] = useState<'teacher' | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  // Debounce search query to server (400ms pause)
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

  const getRolePillClass = (role?: string) => {
    switch (role) {
      case 'Super Admin':
        return 'pill-forest';
      case 'School Admin':
        return 'pill-ember';
      case 'Teacher':
        return 'pill-grape';
      case 'Student':
        return 'pill-lime';
      default:
        return 'pill-muted';
    }
  };

  return (
    <div className="space-y-4 font-body pb-12">
      {/* ── Mobile Top Header ── */}
      <div className="space-y-1.5 border-b border-border pb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest">
          <ShieldCheck className="w-3 h-3 text-forest" />
          Global Control • Mobile
        </div>
        <h1 className="font-heading font-bold text-xl text-ink tracking-tight">
          Super Admin Roster
        </h1>
        <p className="text-xs text-ink/70">
          {userStats?.total ?? totalUsersCount} accounts across {schools.length} institutions
        </p>
      </div>

      {errorMessage && (
        <div className="p-3 text-xs font-medium text-ember bg-ember/10 border border-ember/30 rounded-card">
          {errorMessage}
        </div>
      )}

      {/* ── Action Triggers Bar (Part A) ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setIsCreateSchoolOpen(true)}
          className="px-3 py-2 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-forest hover:text-white transition-all flex items-center gap-1 shrink-0 active:scale-95"
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>School & Admin</span>
        </button>
        <button
          type="button"
          onClick={() => setCreateUserProfile('teacher')}
          className="px-3 py-2 rounded-pill bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all flex items-center gap-1 shrink-0 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Teacher</span>
        </button>
      </div>

      {/* ── Role Count Summary Chips ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-card bg-forest text-white shadow-xs flex justify-between items-center">
          <span className="text-xs font-heading font-medium">Admins</span>
          <span className="font-heading font-bold text-lg">
            {(userStats?.super_admin ?? users.filter((u) => u.role_label === 'Super Admin').length) +
             (userStats?.school_admin ?? users.filter((u) => u.role_label === 'School Admin').length)}
          </span>
        </div>
        <div className="p-3 rounded-card bg-surface border border-border shadow-xs flex justify-between items-center">
          <span className="text-xs font-heading font-medium text-ink/80">Teachers</span>
          <span className="font-heading font-bold text-lg text-ink">
            {userStats?.teacher ?? users.filter((u) => u.role_label === 'Teacher').length}
          </span>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="space-y-2 pt-1">
        <div className="relative">
          {isUpdatingUsers ? (
            <Loader2 className="w-4 h-4 text-forest animate-spin absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          ) : (
            <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          )}
          <input
            type="text"
            placeholder="Search by username, email, school..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-card border border-border bg-surface text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:border-forest transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Horizontal scrollable role filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {['ALL', 'Super Admin', 'School Admin', 'Teacher', 'Student'].map((role) => (
            <button
              key={role}
              onClick={() => {
                setRoleFilter(role);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-pill font-heading text-xs whitespace-nowrap transition-all active:scale-95 ${
                roleFilter === role
                  ? 'bg-ink text-white font-semibold'
                  : 'bg-surface border border-border text-ink/70 hover:text-ink'
              }`}
            >
              {role === 'ALL' ? 'All Roles' : role}
            </button>
          ))}
        </div>
      </div>

      {isInitialLoading && (
        <div className="space-y-3" aria-label="Loading mobile dashboard skeleton">
          <SkeletonRoleDeck />
          <SkeletonRoster count={5} />
        </div>
      )}

      {/* ── Single-Column Feed of Accounts ── */}
      {!isInitialLoading && (
        <div className={`space-y-2.5 transition-opacity duration-150 ${isUpdatingUsers ? 'opacity-60' : 'opacity-100'}`}>
          <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
            <span>ACCOUNTS ({totalUsersCount})</span>
          </div>

          {users.length === 0 ? (
            <div className="p-8 text-center bg-surface border border-border rounded-card space-y-2">
              <span className="font-heading font-semibold text-sm text-ink block">
                No accounts match your criteria.
              </span>
              <p className="text-xs text-ink/50">
                {searchTerm || roleFilter !== 'ALL'
                  ? 'Try clearing your search or filter.'
                  : 'No accounts recorded yet.'}
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
                  className="mt-1 px-3 py-1 rounded-pill text-xs font-heading font-semibold bg-forest text-white"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
          users.map((u, idx) => (
            <div
              key={u.id}
              style={getStaggerDelay(idx, true)}
              className={`animate-card-enter p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2.5 ${MOTION.touch.card.className}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-heading font-bold text-sm text-ink flex items-center gap-1.5">
                    {u.username}
                  </div>
                  {u.email && (
                    <div className="text-[11px] text-ink/60 font-mono">{u.email}</div>
                  )}
                  {u.mobile_number && (
                    <div className="text-[11px] text-forest font-mono font-medium">{u.mobile_number}</div>
                  )}
                </div>
                <span className={`pill text-[10px] py-0.5 px-2 ${getRolePillClass(u.role_label)}`}>
                  {u.role_label || 'User'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
                <span className="truncate max-w-[170px] text-ink/60">
                  {u.school_name ? `🏫 ${u.school_name}` : 'Global Tenant'}
                </span>
                <button
                  type="button"
                  id={`mobile-edit-user-${u.id}`}
                  onClick={() => setEditUserId(u.id)}
                  className="px-3 py-1 rounded-pill border border-border bg-bg text-ink font-heading font-semibold text-xs flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          ))
        )}

        {/* Mobile Pagination */}
        <Pagination
          currentPage={currentPage}
          totalCount={totalUsersCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          itemName="accounts"
        />
      </div>
      )}

      {/* Modals & Drawers */}
      <CreateSchoolDrawer
        isOpen={isCreateSchoolOpen}
        onClose={() => setIsCreateSchoolOpen(false)}
        onSchoolCreated={() => fetchData()}
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
    </div>
  );
};
