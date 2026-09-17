import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import { classesApi } from '../../api/classes';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { User, School, ClassSection } from '../../types';
import { X, UserPlus, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { PhoneInput } from '../ui/phone-input';
import { SearchableSubjectSelect } from '../ui/searchable-subject-select';
import { CustomSelect } from '../ui/custom-select';

interface CreateUserDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetProfile: 'teacher' | 'student' | 'qbm' | 'deo' | 'validator' | 'deo_validator';
  onUserCreated: (newUser: User) => void;
}

export const CreateUserDrawer: React.FC<CreateUserDrawerProps> = ({
  isOpen,
  onClose,
  targetProfile,
  onUserCreated,
}) => {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | ''>('');
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [selectedClassSection, setSelectedClassSection] = useState<number | ''>('');
  const [primarySubject, setPrimarySubject] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
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

  // Load classes for the active school
  useEffect(() => {
    const sId = currentUser?.school || (selectedSchoolId ? Number(selectedSchoolId) : undefined);
    if (isOpen && sId) {
      classesApi
        .getClasses(sId)
        .then((data) => {
          setClasses(data);
        })
        .catch(() => {
          setClasses([]);
        });
    } else {
      setClasses([]);
    }
  }, [isOpen, currentUser, selectedSchoolId]);

  if (!isOpen) return null;

  const getProfileTitle = () => {
    switch (targetProfile) {
      case 'teacher':
        return 'Create Teacher';
      case 'student':
        return 'Enroll New Student';
      case 'qbm':
        return 'Create Question Bank Manager';
      case 'deo':
        return 'Create Data Entry Operator (DEO)';
      case 'validator':
        return 'Create Question Validator';
      case 'deo_validator':
        return 'Create DEO & Validator (Dual Role)';
      default:
        return 'Create Account';
    }
  };

  const getProfileDescription = () => {
    switch (targetProfile) {
      case 'teacher':
        return 'Provision authoring faculty with test assembly and evaluation rights.';
      case 'student':
        return 'Quickly enroll a candidate for assessments and test attempts.';
      case 'qbm':
        return 'Provision a platform Question Bank Manager authorized to curate and ingest central curriculum question banks.';
      case 'deo':
        return 'Enter curriculum questions, options, and tags for school question banks.';
      case 'validator':
        return 'Review submitted questions, edit metadata, and approve or return for correction.';
      case 'deo_validator':
        return 'Dual-role user holding both question entry and validation approval responsibilities.';
      default:
        return 'Create an institutional user account.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim() || !password.trim()) {
      setErrorMsg('Username and password are required.');
      toast.warning('Username and password are required.');
      return;
    }

    if (!email.trim()) {
      setErrorMsg('Email address is compulsory.');
      toast.warning('Email address is compulsory.');
      return;
    }

    const mobDigits = mobileNumber.replace(/\D/g, '');
    const isTenDigits = mobDigits.length === 10 || (mobDigits.length === 12 && mobDigits.startsWith('91'));
    if (!mobileNumber.trim() || !isTenDigits) {
      setErrorMsg('A valid 10-digit Indian mobile number (+91) is compulsory.');
      toast.warning('A valid 10-digit Indian mobile number (+91) is compulsory.');
      return;
    }

    const schoolIdToUse = targetProfile === 'qbm' ? undefined : (currentUser?.school || (selectedSchoolId ? Number(selectedSchoolId) : undefined));
    if (targetProfile !== 'qbm' && !schoolIdToUse && !currentUser?.school) {
      setErrorMsg('Please select a school for this account.');
      toast.warning('Please select a school for this account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdUser = await usersApi.createUser({
        username: username.trim(),
        password: password.trim(),
        profile: targetProfile,
        email: email.trim(),
        mobile_number: mobileNumber.startsWith('+91') ? mobileNumber : `+91${mobDigits.slice(-10)}`,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        school: schoolIdToUse,
        class_section: selectedClassSection ? Number(selectedClassSection) : undefined,
        primary_subject: primarySubject.trim() || undefined,
      });

      toast.success(`User @${createdUser.username} (${createdUser.role_label}) created successfully!`);
      onUserCreated(createdUser);
      onClose();
      // Reset
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setMobileNumber('');
      setSelectedClassSection('');
      setPrimarySubject('');
    } catch (err: any) {
      const data = err.response?.data;
      let detail = err.message || 'Failed to create account.';
      if (typeof data === 'string') {
        detail = data;
      } else if (data && typeof data === 'object') {
        if (data.detail) detail = data.detail;
        else if (data.username) detail = Array.isArray(data.username) ? data.username[0] : String(data.username);
        else if (data.email) detail = Array.isArray(data.email) ? data.email[0] : String(data.email);
        else if (data.mobile_number) detail = Array.isArray(data.mobile_number) ? data.mobile_number[0] : String(data.mobile_number);
        else if (data.password) detail = Array.isArray(data.password) ? data.password[0] : String(data.password);
        else if (data.non_field_errors) detail = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : String(data.non_field_errors);
        else detail = Object.values(data).flat().join(' ');
      }
      setErrorMsg(detail);
      toast.error(detail);
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

          {/* School Selector (visible if Super Admin and profile is not QBM) */}
          {!currentUser?.school && targetProfile !== 'qbm' && (
            <div className="space-y-1.5 pb-2 border-b border-border">
              <label htmlFor="user-school-select" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Assigned Institution *
              </label>
              {schools.length > 0 ? (
                <CustomSelect
                  id="user-school-select"
                  value={String(selectedSchoolId)}
                  onChange={(val) => setSelectedSchoolId(Number(val))}
                  disabled={isSubmitting}
                  options={schools.map((s) => ({
                    value: String(s.id),
                    label: `${s.name} (#${s.id})`,
                  }))}
                  placeholder="Select an institution..."
                  className="w-full"
                />
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
              <div className="relative">
                <input
                  id="u-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 pr-9 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={isSubmitting}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
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

          {/* Contact Information (Compulsory Email & Mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div className="space-y-1">
              <label htmlFor="u-email" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1">
                Email Address *
              </label>
              <input
                id="u-email"
                type="email"
                required
                placeholder="e.g. user@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-mono"
              />
            </div>

            <PhoneInput
              id="u-mobile"
              label="Mobile Number"
              required={true}
              value={mobileNumber}
              onChange={setMobileNumber}
              disabled={isSubmitting}
              placeholder="98765 43210"
            />
          </div>

          {/* Role-Specific Academic Assignment */}
          {targetProfile === 'student' && (
            <div className="space-y-1.5 pt-1">
              <label htmlFor="u-class-section" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Class & Division Assignment
              </label>
              <CustomSelect
                id="u-class-section"
                value={String(selectedClassSection)}
                onChange={(val) => setSelectedClassSection(val ? Number(val) : '')}
                disabled={isSubmitting}
                options={[
                  { value: '', label: 'No class assigned (Unassigned)' },
                  ...classes.map((c) => ({
                    value: String(c.id),
                    label: `Class ${c.name} (${c.student_count} / ${c.max_students} students enrolled)`,
                  })),
                ]}
                placeholder="Select class section..."
                className="w-full"
              />
              <p className="text-[10px] text-ink/50">
                Enroll student directly into a division (Standards 8, 9, 10 up to Section J).
              </p>
            </div>
          )}

          {targetProfile === 'teacher' && (
            <div className="space-y-1.5 pt-1">
              <label htmlFor="u-primary-subject" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Primary Teaching Subject
              </label>
              <SearchableSubjectSelect
                id="u-primary-subject"
                value={primarySubject}
                onChange={setPrimarySubject}
                disabled={isSubmitting}
                placeholder="Search or enter subject..."
              />
              <p className="text-[10px] text-ink/50">
                Designate teacher's subject specialization for class teacher or subject teacher mappings.
              </p>
            </div>
          )}

          {/* Automatic defaults notification */}
          <div className="p-3 rounded-card bg-surface-muted border border-border text-[11px] text-ink/70 space-y-1">
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-forest" />
              Automatic Permission Grants
            </div>
            <p>
              {targetProfile === 'qbm'
                ? 'Question Bank Manager capabilities (INGEST_GLOBAL_QUESTIONS, GENERATE_SELECT_QUESTIONS) will be granted automatically on creation.'
                : `Standard ${targetProfile.replace('_', ' ')} capabilities will be granted automatically on creation.`}
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
