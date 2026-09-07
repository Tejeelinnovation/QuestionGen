import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import type { User, School } from '../../types';
import { X, UserPlus, Check, AlertCircle } from 'lucide-react';

interface CreateUserDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetProfile: 'school_admin' | 'teacher' | 'student';
  onUserCreated: (newUser: User) => void;
}

export const CreateUserDrawer: React.FC<CreateUserDrawerProps> = ({
  isOpen,
  onClose,
  targetProfile,
  onUserCreated,
}) => {
  const { user: currentUser } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | ''>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load schools if caller is Super Admin (school is null)
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (!currentUser?.school) {
        usersApi
          .getSchools()
          .then((data) => {
            setSchools(data);
            if (data.length > 0 && selectedSchoolId === '') {
              setSelectedSchoolId(data[0].id);
            }
          })
          .catch(() => {
            // Ignore if schools endpoint is empty
          });
      } else {
        setSelectedSchoolId(currentUser.school);
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const getProfileTitle = () => {
    switch (targetProfile) {
      case 'school_admin':
        return 'Create School Admin';
      case 'teacher':
        return 'Create Teacher';
      case 'student':
        return 'Enroll New Student';
      default:
        return 'Create Account';
    }
  };

  const getProfileDescription = () => {
    switch (targetProfile) {
      case 'school_admin':
        return 'Provision administrator credentials with school-wide controls.';
      case 'teacher':
        return 'Provision authoring faculty with test assembly and evaluation rights.';
      case 'student':
        return 'Quickly enroll a candidate for assessments and test attempts.';
      default:
        return 'Create an institutional user account.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim() || !password.trim()) {
      setErrorMsg('Username and password are required.');
      return;
    }

    const schoolIdToUse = currentUser?.school || (selectedSchoolId ? Number(selectedSchoolId) : undefined);
    if (!schoolIdToUse && targetProfile !== 'school_admin' && !currentUser?.school) {
      setErrorMsg('Please select a school for this account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdUser = await usersApi.createUser({
        username: username.trim(),
        password: password.trim(),
        profile: targetProfile,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
        school: schoolIdToUse,
      });

      onUserCreated(createdUser);
      onClose();
      // Reset
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
    } catch (err: any) {
      const data = err.response?.data;
      let detail = err.message || 'Failed to create account.';
      if (typeof data === 'string') {
        detail = data;
      } else if (data && typeof data === 'object') {
        if (data.detail) detail = data.detail;
        else if (data.username) detail = Array.isArray(data.username) ? data.username[0] : String(data.username);
        else if (data.password) detail = Array.isArray(data.password) ? data.password[0] : String(data.password);
        else if (data.non_field_errors) detail = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : String(data.non_field_errors);
        else detail = Object.values(data).flat().join(' ');
      }
      setErrorMsg(detail);
    } finally {
      setIsSubmitting(false);
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

      {/* Slide-over Drawer Panel */}
      <div className="relative z-10 w-full sm:max-w-md md:max-w-lg bg-surface border-l border-border h-full shadow-float flex flex-col justify-between animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg text-ink">
                {getProfileTitle()}
              </h2>
              <p className="text-xs text-ink/65">
                {getProfileDescription()}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} id="create-user-form" className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* School Selector (visible if Super Admin) */}
          {!currentUser?.school && (
            <div className="space-y-1.5 pb-2 border-b border-border">
              <label htmlFor="user-school-select" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Assigned Institution *
              </label>
              {schools.length > 0 ? (
                <select
                  id="user-school-select"
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-medium cursor-pointer"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (#{s.id})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-ember/90 italic">
                  No schools found. Please create a school first.
                </div>
              )}
            </div>
          )}

          {/* Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label htmlFor="u-username" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Username *
              </label>
              <input
                id="u-username"
                type="text"
                required
                placeholder="e.g. jdoe_math"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="u-password" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Initial Password *
              </label>
              <input
                id="u-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
              />
            </div>
          </div>

          {/* Personal Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label htmlFor="u-firstname" className="block font-heading text-xs font-medium text-ink">
                First Name
              </label>
              <input
                id="u-firstname"
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="u-lastname" className="block font-heading text-xs font-medium text-ink">
                Last Name
              </label>
              <input
                id="u-lastname"
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="u-email" className="block font-heading text-xs font-medium text-ink">
              Email Address (Optional)
            </label>
            <input
              id="u-email"
              type="email"
              placeholder="john.doe@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-mono"
            />
          </div>

          {/* Automatic defaults notification */}
          <div className="p-3 rounded-card bg-surface-muted border border-border text-[11px] text-ink/70 space-y-1">
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-forest" />
              Automatic Permission Grants
            </div>
            <p>
              Standard {targetProfile.replace('_', ' ')} capabilities will be granted automatically on creation.
            </p>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-6 border-t border-border bg-surface-muted/30 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-user-form"
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Creating User...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
