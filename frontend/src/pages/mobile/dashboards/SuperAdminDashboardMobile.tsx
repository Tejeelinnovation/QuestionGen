import React, { useState, useEffect } from 'react';
import { usersApi } from '../../../api/users';
import type { User } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { ShieldCheck, Search, RefreshCw } from 'lucide-react';

export const SuperAdminDashboardMobile: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  useEffect(() => {
    fetchUsers();
  }, []);

  const countsByRole = users.reduce<Record<string, number>>((acc, u) => {
    const role = u.role_label || 'Unknown';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role_label !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchUsername = u.username.toLowerCase().includes(q);
      const matchSchool = u.school_name?.toLowerCase().includes(q) || false;
      const matchEmail = u.email?.toLowerCase().includes(q) || false;
      return matchUsername || matchSchool || matchEmail;
    }
    return true;
  });

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
    <div className="space-y-5 font-body">
      {/* ── Mobile Top Header ── */}
      <div className="space-y-1.5 border-b border-border pb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest">
          <ShieldCheck className="w-3 h-3 text-forest" />
          Global Tenant Control
        </div>
        <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
          Super Admin Console
        </h1>
        <p className="text-xs text-ink/70">
          Root oversight across all multi-tenant educational institutions.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── Single Prominent Condensed Headline Stat Block ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-4xl text-forest tracking-tight">
              {users.length}
            </span>
            <span className="font-heading font-semibold text-sm text-ink/80">
              Total Accounts Active
            </span>
          </div>
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="p-1.5 rounded-pill border border-border bg-surface hover:bg-surface-muted active:scale-95 text-ink/60"
            title="Refresh"
            aria-label="Refresh accounts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Condensed inline breakdown pills */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/60 text-xs">
          <span className="pill pill-forest text-[11px] py-0.5">
            {countsByRole['Super Admin'] || 0} Super Admins
          </span>
          <span className="pill pill-ember text-[11px] py-0.5">
            {countsByRole['School Admin'] || 0} School Admins
          </span>
          <span className="pill pill-grape text-[11px] py-0.5">
            {countsByRole['Teacher'] || 0} Teachers
          </span>
          <span className="pill pill-lime text-[11px] py-0.5">
            {countsByRole['Student'] || 0} Students
          </span>
        </div>
      </div>

      {/* ── Filter Bar & Search ── */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search account name, school..."
            className="w-full pl-9 pr-3 py-2.5 rounded-card bg-surface border border-border text-xs font-body text-ink placeholder:text-ink/40 focus:outline-none focus:border-forest"
          />
          <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-3" />
        </div>

        {/* Horizontal scrollable role filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {['ALL', 'Super Admin', 'School Admin', 'Teacher', 'Student'].map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
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

      {/* ── Single-Column Feed of Accounts ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>ACCOUNTS ({filteredUsers.length})</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-ink/50 bg-surface border border-border rounded-card">
            Loading institutional roster...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No accounts match your criteria.
          </div>
        ) : (
          filteredUsers.map((u, idx) => (
            <div
              key={u.id}
              style={getStaggerDelay(idx, true)}
              className={`animate-card-enter p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2 ${MOTION.touch.card.className}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-heading font-bold text-sm text-ink flex items-center gap-1.5">
                    {u.username}
                  </div>
                  {u.email && (
                    <div className="text-[11px] text-ink/60 font-mono">{u.email}</div>
                  )}
                </div>
                <span className={`pill text-[10px] py-0.5 px-2 ${getRolePillClass(u.role_label)}`}>
                  {u.role_label || 'User'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px] text-ink/60">
                <span className="truncate max-w-[180px]">
                  {u.school_name ? `🏫 ${u.school_name}` : 'Global Tenant'}
                </span>
                <span className="font-mono text-ink/40">#{u.id}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
