import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ALL_CAPABILITIES } from '../../components/users/PermissionManager';
import { LogOut, User, Building, Calendar, ShieldCheck, Mail, AlertTriangle, Phone, BookOpen, GraduationCap, Hash, Lock, Edit3, KeyRound } from 'lucide-react';
import { getStaggerDelay, MOTION, CARD_MOTION } from '../../lib/motion';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { ChangePasswordModal } from '../../components/profile/ChangePasswordModal';

export const ProfilePageDesktop: React.FC = () => {
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
    <div className="space-y-8">
      {/* ── Top Typographic Header ── */}
      <div className="border-b border-border pb-6 flex items-end justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Authenticated Identity
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Account Profile
          </h1>
          <p className="font-body text-ink/75 text-base max-w-2xl leading-relaxed">
            Personal identity credentials, institutional affiliation, and assigned system capabilities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className={`pill ${getRolePillClass()} text-xs py-1 px-3`}>
            {role_label || 'User'}
          </span>
        </div>
      </div>

      {/* ── Asymmetric Layout Split: Identity & Session (Left) vs Capabilities (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Profile Card & Session Control (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Identity Card */}
          <div
            style={getStaggerDelay(0)}
            className={`animate-card-enter bg-surface border border-border rounded-lg p-6 shadow-card space-y-6 ${CARD_MOTION.interactive}`}
          >
            {/* Profile Header and Edit Action */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-14 h-14 rounded-card bg-forest text-white font-heading font-bold text-xl flex items-center justify-center shadow-sm shrink-0">
                  {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`pill ${getRolePillClass()} text-[10px]`}>
                      {role_label}
                    </span>
                    <span className="font-mono text-xs text-ink/50">#{user?.id}</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl text-ink truncate">
                    {fullName || user?.username}
                  </h2>
                  <p className="font-mono text-xs text-ink/60">@{user?.username}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-border bg-surface text-ink hover:border-forest hover:text-forest text-xs font-semibold transition-all shadow-2xs shrink-0 cursor-pointer"
                title="Edit personal name and teaching subject"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            {/* Profile Attributes List */}
            <div className="space-y-3 pt-4 border-t border-border text-xs">
              <div className="flex items-center gap-3 py-1">
                <Mail className="w-4 h-4 text-ink/40 shrink-0" />
                <div className="flex-1 truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink/60 block text-[10px] uppercase font-mono">Email Address</span>
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded" title="Governed by School Administration">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  </div>
                  <span className="font-mono text-ink font-medium">
                    {user?.email || <span className="italic text-ink/40">Not specified</span>}
                  </span>
                </div>
              </div>

              {/* Mobile Number */}
              <div className="flex items-center gap-3 py-1">
                <Phone className="w-4 h-4 text-ink/40 shrink-0" />
                <div className="flex-1 truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink/60 block text-[10px] uppercase font-mono">Mobile Number</span>
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded" title="Governed by School Administration">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  </div>
                  <span className="font-mono text-ink font-medium">
                    {user?.mobile_number || <span className="italic text-ink/40">Not registered</span>}
                  </span>
                </div>
              </div>

              {/* Teacher Primary Subject */}
              {user?.primary_subject && (
                <div className="flex items-center gap-3 py-1">
                  <BookOpen className="w-4 h-4 text-forest shrink-0" />
                  <div className="flex-1 truncate">
                    <span className="text-ink/60 block text-[10px] uppercase font-mono">Teaching Subject Specialization</span>
                    <span className="font-mono text-forest font-semibold">
                      {user.primary_subject}
                    </span>
                  </div>
                </div>
              )}

              {/* Student Class / Division */}
              {user?.class_section_name && (
                <div className="flex items-center gap-3 py-1">
                  <GraduationCap className="w-4 h-4 text-ink/40 shrink-0" />
                  <div className="flex-1 truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink/60 block text-[10px] uppercase font-mono">Enrolled Class & Division</span>
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded" title="Governed by School Administration">
                        <Lock className="w-2.5 h-2.5" /> Locked
                      </span>
                    </div>
                    <span className="font-heading text-ink font-semibold">
                      Class {user.class_section_name}
                    </span>
                  </div>
                </div>
              )}

              {/* Student GR Number & Roll Number */}
              {(user?.gr_number || user?.roll_number) && (
                <div className="flex items-center gap-3 py-1">
                  <Hash className="w-4 h-4 text-ink/40 shrink-0" />
                  <div className="flex-1 truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink/60 block text-[10px] uppercase font-mono">Student Identification</span>
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded" title="Governed by School Administration">
                        <Lock className="w-2.5 h-2.5" /> Locked
                      </span>
                    </div>
                    <span className="font-mono text-ink font-medium">
                      {user?.gr_number ? `GR: ${user.gr_number}` : ''}
                      {user?.gr_number && user?.roll_number ? ' • ' : ''}
                      {user?.roll_number ? `Roll: ${user.roll_number}` : ''}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 py-1">
                <Building className="w-4 h-4 text-ink/40 shrink-0" />
                <div className="flex-1 truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink/60 block text-[10px] uppercase font-mono">School Institution</span>
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-ink/40 bg-surface-muted px-1 rounded" title="Governed by School Administration">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  </div>
                  <span className="text-ink font-medium">
                    {user?.school_name || <span className="italic text-ink/40">Global (No Institution)</span>}
                  </span>
                </div>
              </div>

              {user?.created_by_username && (
                <div className="flex items-center gap-3 py-1">
                  <User className="w-4 h-4 text-ink/40 shrink-0" />
                  <div className="flex-1 truncate">
                    <span className="text-ink/60 block text-[10px] uppercase font-mono">Account Provisioned By</span>
                    <span className="font-mono text-ink font-medium">
                      @{user.created_by_username}
                    </span>
                  </div>
                </div>
              )}

              {user?.date_joined && (
                <div className="flex items-center gap-3 py-1">
                  <Calendar className="w-4 h-4 text-ink/40 shrink-0" />
                  <div className="flex-1 truncate">
                    <span className="text-ink/60 block text-[10px] uppercase font-mono">Registered Since</span>
                    <span className="font-mono text-ink/80">
                      {new Date(user.date_joined).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Account Security & Password */}
          <div
            style={getStaggerDelay(1)}
            className="animate-card-enter bg-surface border border-border rounded-lg p-6 shadow-card space-y-4"
          >
            <div className="border-b border-border pb-3 flex items-start justify-between">
              <div>
                <span className="pill pill-forest text-[10px] uppercase mb-1">Security & Access</span>
                <h3 className="font-heading font-bold text-base text-ink">
                  Account Credentials
                </h3>
                <p className="text-xs text-ink/65 mt-0.5">
                  Update password or request a secure recovery email link.
                </p>
              </div>
              <KeyRound className="w-5 h-5 text-forest/80 shrink-0" />
            </div>

            <button
              type="button"
              id="profile-password-btn"
              onClick={() => setIsPasswordModalOpen(true)}
              className={`w-full py-2.5 px-4 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs hover:border-forest hover:text-forest transition-all flex items-center justify-center gap-2 cursor-pointer ${MOTION.touch.button.className}`}
            >
              <KeyRound className="w-3.5 h-3.5 text-forest" />
              <span>Change Password / Security</span>
            </button>
          </div>

          {/* Session Termination / Sign Out Section */}
          <div
            style={getStaggerDelay(2)}
            className="animate-card-enter bg-surface border border-border rounded-lg p-6 shadow-card space-y-4"
          >
            <div className="border-b border-border pb-3">
              <span className="pill pill-muted text-[10px] uppercase mb-1">Session Security</span>
              <h3 className="font-heading font-bold text-base text-ink">
                Sign Out of Platform
              </h3>
              <p className="text-xs text-ink/65 mt-0.5">
                Revoke current authentication token and return to system login.
              </p>
            </div>

            {!showConfirmLogout ? (
              <button
                type="button"
                id="profile-signout-btn"
                onClick={() => setShowConfirmLogout(true)}
                className={`w-full py-3 px-4 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs hover:bg-ink hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer ${MOTION.touch.button.className}`}
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            ) : (
              <div className="p-4 rounded-card bg-ember/10 border border-ember/30 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-semibold text-ember">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Confirm Sign Out</span>
                </div>
                <p className="text-xs text-ink/75 leading-relaxed">
                  Are you sure you wish to end your active session on this device?
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isLoggingOut}
                    onClick={handleLogout}
                    className="flex-1 py-2 px-3 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoggingOut ? 'Signing out...' : 'Yes, Sign Out'}
                  </button>
                  <button
                    type="button"
                    disabled={isLoggingOut}
                    onClick={() => setShowConfirmLogout(false)}
                    className="px-4 py-2 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-surface-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Granted Capabilities List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-1 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-forest" />
                <h2 className="font-heading font-bold text-lg text-ink">
                  Granted Capabilities
                </h2>
              </div>
              <p className="text-xs text-ink/65 mt-0.5">
                Atomic access controls attached to your profile (Read-only view)
              </p>
            </div>

            <span className="pill pill-forest text-xs font-mono">
              {userCaps.length} Active Rights
            </span>

          </div>

          {/* Capability Grid - only show granted caps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {ALL_CAPABILITIES.filter((cap) => userCaps.includes(cap.name)).map((cap, idx) => {
              return (
                <div
                  key={cap.name}
                  style={getStaggerDelay(idx)}
                  className="animate-card-enter p-4 rounded-card border bg-surface border-border shadow-xs transition-all flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-semibold text-xs text-ink">
                        {cap.label}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-forest" />
                    </div>
                    <p className="text-[11px] text-ink/65 leading-snug">
                      {cap.description}
                    </p>
                  </div>

                  <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-ink/50">
                    <span>{cap.category}</span>
                    <span className="text-forest font-semibold">GRANTED</span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

      </div>

      {/* Edit Profile & Password Modals */}
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
