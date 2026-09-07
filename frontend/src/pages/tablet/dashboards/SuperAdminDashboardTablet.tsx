import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import type { User } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';

export const SuperAdminDashboardTablet: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await usersApi.getUsers();
        setUsers(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load user accounts from server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
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
      subtext: 'Enrolled exam candidates sitting tests and reviewing scored attempts.',
    },
  ];

  return (
    <div className="space-y-8 font-body">
      {/* ── Top Header ── */}
      <div className="space-y-2 border-b border-border pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Global Tenant Control • Tablet
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Super Admin Directory
        </h1>
        <p className="text-sm text-ink/75 leading-relaxed">
          Overseeing{' '}
          <span className="font-heading font-bold text-forest underline decoration-forest/40">
            {users.length} active user accounts
          </span>{' '}
          across all tenant school systems.
        </p>
      </div>

      {isLoading && (
        <div className="p-8 text-center bg-surface border border-border rounded-card text-ink/60 text-sm">
          Loading institutional directory...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && (
        <>
          {/* ── 2-Column Bento Reflow for Roles Deck ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink/60">
                // System Roles Breakdown (2-Column Tablet Grid)
              </span>
              <span className="text-xs text-ink/50 font-mono">
                {users.length} Total Users
              </span>
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

          {/* ── 2-Column Bento Reflow for User Directory ── */}
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
                    className="bg-surface border border-border rounded-card p-4 shadow-card space-y-2.5 active:scale-[0.99] transition-transform"
                  >
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
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
