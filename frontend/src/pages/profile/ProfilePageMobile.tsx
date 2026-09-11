import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ALL_CAPABILITIES } from '../../components/users/PermissionManager';
import { LogOut, User, Building, Mail, ShieldCheck, AlertTriangle, Phone, BookOpen, GraduationCap, Hash, Lock, Edit3, KeyRound } from 'lucide-react';
import { getStaggerDelay, MOTION } from '../../lib/motion';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { ChangePasswordModal } from '../../components/profile/ChangePasswordModal';

export const ProfilePageMobile: React.FC = () => {
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
    <div className="space-y-5 pb-8">
      {/* Identity Summary Card */}
      <div
        style={getStaggerDelay(0)}
        className="animate-card-enter bg-surface border border-border rounded-card p-4 shadow-card space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-card bg-forest text-white font-heading font-bold text-base flex items-center justify-center shrink-0">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`pill ${getRolePillClass()} text-[9px] py-0 px-2`}>
                  {role_label}
                </span>
                <span className="font-mono text-[10px] text-ink/40">#{user?.id}</span>
              </div>
              <h1 className="font-heading font-bold text-base text-ink truncate">
                {fullName || user?.username}
              </h1>
              <p className="font-mono text-[11px] text-ink/60">@{user?.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="p-2 rounded-card border border-border bg-surface text-ink text-xs hover:border-forest hover:text-forest transition-colors cursor-pointer"
              title="Edit Profile"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(true)}
              className="p-2 rounded-card border border-border bg-surface text-forest text-xs hover:border-forest hover:bg-forest/5 transition-colors cursor-pointer"
              title="Security & Password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border text-xs text-ink/75">
          {user?.email && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <Mail className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                <span className="font-mono text-[11px] truncate">{user.email}</span>
              </div>
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
                <Lock className="w-2 h-2" /> Locked
              </span>
            </div>
          )}
          {user?.mobile_number && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <Phone className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                <span className="font-mono text-[11px] truncate">{user.mobile_number}</span>
              </div>
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
                <Lock className="w-2 h-2" /> Locked
              </span>
            </div>
          )}
          {user?.primary_subject && (
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-forest shrink-0" />
              <span className="text-[11px]">Subject: <strong className="font-mono text-forest">{user.primary_subject}</strong></span>
            </div>
          )}
          {user?.class_section_name && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                <span className="text-[11px]">Class: <strong className="font-heading font-semibold text-ink">{user.class_section_name}</strong></span>
              </div>
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
                <Lock className="w-2 h-2" />
              </span>
            </div>
          )}
          {(user?.gr_number || user?.roll_number) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                <span className="font-mono text-[11px]">
                  {user?.gr_number ? `GR: ${user.gr_number}` : ''}
                  {user?.gr_number && user?.roll_number ? ' • ' : ''}
                  {user?.roll_number ? `Roll: ${user.roll_number}` : ''}
                </span>
              </div>
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono text-ink/40 bg-surface-muted px-1 rounded shrink-0">
                <Lock className="w-2 h-2" />
              </span>
            </div>
          )}
          {user?.school_name && (
            <div className="flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-ink/40 shrink-0" />
              <span className="truncate">{user.school_name}</span>
            </div>
          )}
          {user?.created_by_username && (
            <div className="flex items-center gap-2 text-[11px]">
              <User className="w-3.5 h-3.5 text-ink/40 shrink-0" />
              <span>Created by: <span className="font-mono font-medium text-ink">@{user.created_by_username}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* Capabilities Overview */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-forest" />
            <h2 className="font-heading font-bold text-sm text-ink">
              Your Capabilities
            </h2>
          </div>
          <span className="pill pill-forest text-[10px] font-mono">
            {userCaps.length} Active
          </span>
        </div>

        <div className="space-y-1.5">
          {ALL_CAPABILITIES.filter((c) => userCaps.includes(c.name)).map((cap, idx) => (
            <div
              key={cap.name}
              style={getStaggerDelay(idx)}
              className="animate-card-enter p-3 rounded-card bg-surface border border-border flex items-center justify-between gap-2"
            >
              <div>
                <div className="font-heading font-semibold text-xs text-ink">
                  {cap.label}
                </div>
                <div className="text-[10px] font-mono text-ink/50">
                  {cap.name}
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-forest shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Sign Out Action */}
      <div className="pt-2">
        {!showConfirmLogout ? (
          <button
            type="button"
            id="mobile-profile-signout-btn"
            onClick={() => setShowConfirmLogout(true)}
            className={`w-full py-3 px-4 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs hover:bg-ink hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[48px] cursor-pointer ${MOTION.touch.button.className}`}
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
              Are you sure you wish to log out from this session?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleLogout}
                className="flex-1 py-3 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 min-h-[48px] cursor-pointer disabled:opacity-50"
              >
                {isLoggingOut ? 'Signing out...' : 'Sign Out'}
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowConfirmLogout(false)}
                className="px-5 py-3 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs min-h-[48px] cursor-pointer"
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
