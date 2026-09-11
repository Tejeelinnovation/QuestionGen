import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ALL_CAPABILITIES } from '../../components/users/PermissionManager';
import { LogOut, User, Building, ShieldCheck, Mail, AlertTriangle, Phone, BookOpen, GraduationCap, Hash, Lock, Edit3, KeyRound } from 'lucide-react';
import { getStaggerDelay, MOTION } from '../../lib/motion';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { ChangePasswordModal } from '../../components/profile/ChangePasswordModal';

export const ProfilePageTablet: React.FC = () => {
  const { user, role_label, logout } = useAuth();
  const navigate = useNavigate();
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  const getRolePillClass = () => {
    switch (user?.role_label) {
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

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  const userCaps = user?.capabilities || [];

  return (
    <div className="space-y-6">
      {/* ── Top Header ── */}
      <div className="border-b border-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
            Account Profile
          </h1>
          <p className="text-xs text-ink/70">
            System credentials, school details, and capability rights
          </p>
        </div>

        <span className={`pill ${getRolePillClass()} text-xs py-1 px-3`}>
          {role_label || 'User'}
        </span>
      </div>

      {/* Identity Card */}
      <div
        style={getStaggerDelay(0)}
        className="animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card space-y-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-card bg-forest text-white font-heading font-bold text-lg flex items-center justify-center shrink-0">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="space-y-0.5 min-w-0 flex-1">
              <h2 className="font-heading font-bold text-lg text-ink truncate">
                {fullName || user?.username}
              </h2>
              <div className="flex items-center gap-2 text-xs text-ink/60">
                <span className="font-mono">@{user?.username}</span>
                <span>•</span>
                <span className="font-mono">ID #{user?.id}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill border border-border bg-surface text-ink text-xs font-semibold hover:border-forest hover:text-forest transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill border border-border bg-surface text-ink text-xs font-semibold hover:border-forest hover:text-forest transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-forest" />
              <span>Security</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-xs">
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-ink/40 shrink-0" />
            <span className="truncate">{user?.email || 'No email recorded'}</span>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
              <Lock className="w-2 h-2" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-ink/40 shrink-0" />
            <span className="truncate">{user?.mobile_number || 'No mobile recorded'}</span>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
              <Lock className="w-2 h-2" />
            </span>
          </div>
          {user?.primary_subject && (
            <div className="col-span-2 flex items-center gap-2 text-ink/80">
              <BookOpen className="w-3.5 h-3.5 text-forest" />
              <span>Subject: <strong className="font-mono text-forest">{user.primary_subject}</strong></span>
            </div>
          )}
          {user?.class_section_name && (
            <div className="flex items-center gap-2 text-ink/80">
              <GraduationCap className="w-3.5 h-3.5 text-ink/40" />
              <span>Class: <strong className="font-heading font-semibold text-ink">{user.class_section_name}</strong></span>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
                <Lock className="w-2 h-2" />
              </span>
            </div>
          )}
          {(user?.gr_number || user?.roll_number) && (
            <div className="flex items-center gap-2 text-ink/80">
              <Hash className="w-3.5 h-3.5 text-ink/40" />
              <span className="font-mono text-xs">
                {user?.gr_number ? `GR: ${user.gr_number}` : ''}
                {user?.gr_number && user?.roll_number ? ' • ' : ''}
                {user?.roll_number ? `Roll: ${user.roll_number}` : ''}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
                <Lock className="w-2 h-2" />
              </span>
            </div>
          )}
          <div className="col-span-2 flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-ink/40" />
            <span className="truncate">{user?.school_name || 'Global Scope'}</span>
          </div>
          {user?.created_by_username && (
            <div className="col-span-2 flex items-center gap-2 text-ink/70">
              <User className="w-3.5 h-3.5 text-ink/40" />
              <span>Created by: <strong className="font-mono">@{user.created_by_username}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Granted Capabilities List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-forest" />
            <h2 className="font-heading font-bold text-base text-ink">
              Granted Capabilities
            </h2>
          </div>
          <span className="pill pill-forest text-xs font-mono">
            {userCaps.length} Active
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {ALL_CAPABILITIES.filter((cap) => userCaps.includes(cap.name)).map((cap, idx) => (
            <div
              key={cap.name}
              style={getStaggerDelay(idx)}
              className="animate-card-enter p-3 rounded-card border text-xs flex flex-col justify-between min-h-[72px] bg-surface border-border"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-xs text-ink">
                  {cap.label}
                </span>
                <span className="w-2 h-2 rounded-full bg-forest" />
              </div>
              <span className="font-mono text-[10px] text-ink/50 pt-1">
                {cap.name}
              </span>
            </div>
          ))}
        </div>

      </div>

      {/* Sign Out Card */}
      <div className="pt-2">
        {!showConfirmLogout ? (
          <button
            type="button"
            id="profile-signout-tablet-btn"
            onClick={() => setShowConfirmLogout(true)}
            className={`w-full py-3.5 px-4 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs hover:bg-ink hover:text-white transition-all flex items-center justify-center gap-2 min-h-[48px] cursor-pointer ${MOTION.touch.button.className}`}
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out of Platform</span>
          </button>
        ) : (
          <div className="p-4 rounded-card bg-ember/10 border border-ember/30 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-ember">
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Sign Out</span>
            </div>
            <p className="text-xs text-ink/80">
              Are you sure you wish to log out from this tablet session?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleLogout}
                className="flex-1 py-3 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 min-h-[44px] cursor-pointer disabled:opacity-50"
              >
                {isLoggingOut ? 'Signing out...' : 'Yes, Sign Out'}
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowConfirmLogout(false)}
                className="px-5 py-3 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs min-h-[44px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
};
