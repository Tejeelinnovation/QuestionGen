import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import type { User, School } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { CreateSchoolDrawer } from '../../../components/schools/CreateSchoolDrawer';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { Plus, Edit2, Building2 } from 'lucide-react';

export const SuperAdminDashboardTablet: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateSchoolOpen, setIsCreateSchoolOpen] = useState(false);
  const [createUserProfile, setCreateUserProfile] = useState<'school_admin' | 'teacher' | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [usersData, schoolsData] = await Promise.all([
        usersApi.getUsers(),
        usersApi.getSchools().catch(() => [] as School[]),
      ]);
      setUsers(usersData);
      setSchools(schoolsData);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load user accounts from server.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const countsByRole = users.reduce<Record<string, number>>((acc, u) => {
    const role = u.role_label || 'Unknown';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const roleDeck = [
    {
      title: 'Super Admins',
      count: countsByRole['Super Admin'] || 0,
      scope: 'Global Scope',
      accent: 'forest',
      badgeClass: 'pill-lime',
      cardClass: 'bg-forest text-white',
      subtext: 'Global tenant controllers with root capabilities across all institutions.',
    },
    {
      title: 'School Admins',
      count: countsByRole['School Admin'] || 0,
      scope: 'Institutional Scope',
      accent: 'ember',
      badgeClass: 'pill-ember',
      cardClass: 'bg-surface text-ink border border-border',
      subtext: 'School-level operators managing teacher rosters and examinations.',
    },
    {
      title: 'Teachers',
      count: countsByRole['Teacher'] || 0,
      scope: 'Pedagogical Scope',
      accent: 'grape',
      badgeClass: 'pill-grape',
      cardClass: 'bg-surface text-ink border border-border',
      subtext: 'Course authors drafting question papers, setting rubrics, and grading.',
    },
    {
      title: 'Students',
      count: countsByRole['Student'] || 0,
      scope: 'Candidate Scope',
      accent: 'lime',
      badgeClass: 'pill-lime',
      cardClass: 'bg-surface text-ink border border-border',
      subtext: 'Assessment examinees taking adaptive tests and receiving grades.',
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
            className="px-3 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-ink hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>School</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateUserProfile('school_admin')}
            className="px-3 py-2 text-xs font-heading font-semibold rounded-pill bg-ember text-white hover:bg-ember/90 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Admin</span>
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
          {/* ── 4-Card 2x2 Grid for Role Breakdown ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink/60">
                // Role Directory Breakdown
              </span>
              <span className="text-xs text-ink/50">{users.length} Total Users</span>
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

          {/* ── 2-Column Grid for User Directory ── */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="font-heading font-bold text-xl text-ink">
                All Enrolled User Accounts
              </h2>
              <span className="pill pill-forest text-xs">
                {users.length} Accounts
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
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
          </section>
        </>
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
