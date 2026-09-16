import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import { classesApi } from '../../api/classes';
import { useAuth } from '../../auth/AuthContext';
import { PermissionManager } from './PermissionManager';
import type { User, CapabilityName, ClassSection } from '../../types';
import { X, UserCheck, Shield, Check, AlertCircle, RefreshCw, BookOpen, GraduationCap } from 'lucide-react';
import { PhoneInput } from '../ui/phone-input';
import { SearchableSubjectSelect } from '../ui/searchable-subject-select';

interface UpdateUserModalProps {
  userId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: (updatedUser: User) => void;
}

export const UpdateUserModal: React.FC<UpdateUserModalProps> = ({
  userId,
  isOpen,
  onClose,
  onUserUpdated,
}) => {
  const { hasCapability, user: authUser } = useAuth();
  const [userData, setUserData] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'permissions'>('details');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [primarySubject, setPrimarySubject] = useState('');
  const [classSectionId, setClassSectionId] = useState<number | ''>('');
  const [availableClasses, setAvailableClasses] = useState<ClassSection[]>([]);
  const [isActive, setIsActive] = useState(true);

  const isSuperAdmin = hasCapability('CREATE_SCHOOL_ADMIN') || hasCapability('CREATE_SCHOOL');
  const isSchoolAdmin = hasCapability('VIEW_SCHOOL_WIDE_CONTROLS');
  const targetIsManageableBySchoolAdmin = userData
    ? ['Teacher', 'Student', 'Data Entry Operator', 'Validator', 'DEO & Validator'].includes(userData.role_label)
    : true;
  const canManagePermissions = isSuperAdmin || (isSchoolAdmin && targetIsManageableBySchoolAdmin);

  useEffect(() => {
    if (isOpen && userId) {
      setIsLoading(true);
      setFetchError(null);
      setSaveError(null);
      setSaveSuccess(null);
      setActiveTab('details');

      usersApi
        .getUser(userId)
        .then((user) => {
          setUserData(user);
          setFirstName(user.first_name || '');
          setLastName(user.last_name || '');
          setEmail(user.email || '');
          setMobileNumber(user.mobile_number || '');
          setPrimarySubject(user.primary_subject || '');
          setClassSectionId(user.class_section || '');
          setIsActive(user.is_active ?? true);

          if (user.school) {
            classesApi
              .getClasses(user.school)
              .then(setAvailableClasses)
              .catch(() => setAvailableClasses([]));
          } else {
            setAvailableClasses([]);
          }
        })
        .catch((err) => {
          setFetchError(err.response?.data?.detail || 'Failed to fetch user details.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setUserData(null);
      setAvailableClasses([]);
    }
  }, [isOpen, userId]);

  if (!isOpen || !userId) return null;

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!email.trim()) {
      setSaveError('Email address is compulsory.');
      return;
    }

    const mobDigits = mobileNumber.replace(/\D/g, '');
    const isTenDigits = mobDigits.length === 10 || (mobDigits.length === 12 && mobDigits.startsWith('91'));
    if (!mobileNumber.trim() || !isTenDigits) {
      setSaveError('A valid 10-digit Indian mobile number (+91) is compulsory.');
      return;
    }

    setIsSaving(true);

    try {
      const updated = await usersApi.updateUser(userId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        mobile_number: mobileNumber.startsWith('+91') ? mobileNumber : `+91${mobDigits.slice(-10)}`,
        is_active: isActive,
        primary_subject: userData?.role_label === 'Teacher' ? primarySubject.trim() : undefined,
        class_section: userData?.role_label === 'Student' ? (classSectionId ? Number(classSectionId) : null) : undefined,
      });

      setUserData(updated);
      setSaveSuccess('User details updated successfully.');
      onUserUpdated(updated);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.mobile_number?.[0] ||
        err.message ||
        'Failed to update user.';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCapabilityChange = (newCapabilities: CapabilityName[]) => {
    if (userData) {
      const updated = { ...userData, capabilities: newCapabilities };
      setUserData(updated);
      onUserUpdated(updated);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative z-10 w-full sm:max-w-xl md:max-w-2xl bg-surface border-l border-border h-full shadow-float flex flex-col justify-between animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-lg text-ink">
                  Edit User Account
                </h2>
                {userData && (
                  <span className="font-mono text-xs text-ink/50 bg-surface-muted px-2 py-0.5 rounded-sm">
                    #{userData.id}
                  </span>
                )}
              </div>
              <p className="text-xs text-ink/65">
                {userData ? `@${userData.username} • ${userData.role_label}` : 'Loading profile...'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-card border border-border bg-surface-muted flex items-center justify-center text-ink/70 hover:text-ink active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation (visible if Super Admin can manage permissions) */}
        {canManagePermissions && (
          <div className="flex border-b border-border px-6 bg-surface-muted/40">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`py-3 px-4 text-xs font-heading font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'details'
                  ? 'border-forest text-forest bg-surface'
                  : 'border-transparent text-ink/60 hover:text-ink'
              }`}
            >
              Account Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('permissions')}
              className={`py-3 px-4 text-xs font-heading font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'permissions'
                  ? 'border-forest text-forest bg-surface'
                  : 'border-transparent text-ink/60 hover:text-ink'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Capability Permissions</span>
            </button>
          </div>
        )}

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="py-16 text-center space-y-3 text-ink/60">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-forest" />
              <p className="text-xs font-medium">Fetching scoped user data...</p>
            </div>
          )}

          {fetchError && (
            <div className="p-4 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{fetchError}</span>
            </div>
          )}

          {!isLoading && userData && (
            <>
              {/* TAB 1: Account Details */}
              {activeTab === 'details' && (
                <form id="update-user-form" onSubmit={handleSaveDetails} className="space-y-5">
                  {saveSuccess && (
                    <div className="p-3 rounded-card bg-forest/10 border border-forest/20 text-forest text-xs font-medium flex items-center gap-2">
                      <Check className="w-3.5 h-3.5" />
                      <span>{saveSuccess}</span>
                    </div>
                  )}

                  {saveError && (
                    <div className="p-3.5 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  {/* Read-Only Context Bar */}
                  <div className="p-3.5 rounded-card bg-surface-muted border border-border grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-ink/50 block">Username</span>
                      <span className="font-mono font-semibold text-ink">@{userData.username}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono text-ink/50 block">Assigned Role</span>
                      <span className="font-heading font-semibold text-forest">{userData.role_label}</span>
                    </div>
                    {userData.school_name && (
                      <div>
                        <span className="text-[10px] uppercase font-mono text-ink/50 block">Institution</span>
                        <span className="font-medium text-ink truncate block">{userData.school_name}</span>
                      </div>
                    )}
                    {userData.created_by_username && (
                      <div>
                        <span className="text-[10px] uppercase font-mono text-ink/50 block">Created By</span>
                        <span className="font-mono text-ink/80">@{userData.created_by_username}</span>
                      </div>
                    )}
                  </div>

                  {/* Editable Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="edit-first-name" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                        First Name
                      </label>
                      <input
                        id="edit-first-name"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={isSaving}
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="edit-last-name" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                        Last Name
                      </label>
                      <input
                        id="edit-last-name"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isSaving}
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div className="space-y-1">
                      <label htmlFor="edit-email" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1">
                        Email Address *
                      </label>
                      <input
                        id="edit-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isSaving}
                        placeholder="user@school.edu"
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-mono"
                      />
                    </div>

                    <PhoneInput
                      id="edit-mobile"
                      label="Mobile Number"
                      required={true}
                      value={mobileNumber}
                      onChange={setMobileNumber}
                      disabled={isSaving}
                      placeholder="98765 43210"
                    />
                  </div>

                  {/* Teacher Primary Subject */}
                  {userData.role_label === 'Teacher' && (
                    <div className="space-y-1">
                      <label htmlFor="edit-subject" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-forest" />
                        <span>Primary Teaching Subject</span>
                      </label>
                      <SearchableSubjectSelect
                        id="edit-subject"
                        value={primarySubject}
                        onChange={setPrimarySubject}
                        disabled={isSaving}
                        placeholder="Search or enter subject..."
                      />
                    </div>
                  )}

                  {/* Student Class Section */}
                  {userData.role_label === 'Student' && (
                    <div className="space-y-1">
                      <label htmlFor="edit-class-section" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-forest" />
                        <span>Assigned Class & Division</span>
                      </label>
                      <select
                        id="edit-class-section"
                        value={classSectionId}
                        onChange={(e) => setClassSectionId(e.target.value ? Number(e.target.value) : '')}
                        disabled={isSaving}
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {availableClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            Class {cls.name} ({cls.student_count ?? 0}/{cls.max_students} students)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Account Status Toggle */}
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between p-3.5 rounded-card bg-surface-muted/60 border border-border">
                      <div>
                        <div className="font-heading font-semibold text-xs text-ink">
                          Account Status
                        </div>
                        <div className="text-[11px] text-ink/65">
                          {isActive ? 'Account active and permitted to authenticate' : 'Account deactivated'}
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        onClick={() => setIsActive(!isActive)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-pill border-2 border-transparent transition-colors duration-100 ease-in-out focus:outline-hidden ${
                          isActive ? 'bg-forest' : 'bg-ink/20'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-100 ease-in-out ${
                            isActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* TAB 2: Permission Management (Super Admin only) */}
              {activeTab === 'permissions' && canManagePermissions && (
                <PermissionManager user={userData} editorRole={authUser?.role_label} onCapabilityChange={handleCapabilityChange} />

              )}
            </>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-6 border-t border-border bg-surface-muted/30 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            Close
          </button>

          {activeTab === 'details' && !isLoading && userData && (
            <button
              type="submit"
              form="update-user-form"
              disabled={isSaving}
              className="px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving Changes...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save User Details</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
