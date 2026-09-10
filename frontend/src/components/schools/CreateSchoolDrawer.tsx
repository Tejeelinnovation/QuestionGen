import React, { useState } from 'react';
import { usersApi } from '../../api/users';
import type { School, SchoolCreateInput } from '../../types';
import { X, Building2, UserPlus, Check, AlertCircle } from 'lucide-react';
import { SearchableSelect } from '../ui/searchable-select';
import { PhoneInput } from '../ui/phone-input';
import { INDIAN_BOARDS, INDIAN_CURRICULA } from '../../constants/educationData';

interface CreateSchoolDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSchoolCreated: (school: School) => void;
}

export const CreateSchoolDrawer: React.FC<CreateSchoolDrawerProps> = ({
  isOpen,
  onClose,
  onSchoolCreated,
}) => {
  // School Details
  const [name, setName] = useState('');
  const [board, setBoard] = useState('CBSE');
  const [curriculum, setCurriculum] = useState('NCERT');
  const [maxStudents, setMaxStudents] = useState<number>(500);
  const [maxTeachers, setMaxTeachers] = useState<number>(50);
  // System timezone is fixed to 'Asia/Kolkata' for Indian institutions (hidden from UI)
  const [timezone] = useState('Asia/Kolkata');
  const [isCustomJson] = useState(false);
  const [customJson] = useState('{}');

  // Administrator Details (Atomic Unified Creation)
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminMobile, setAdminMobile] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('School name is required.');
      return;
    }

    let configPayload: Record<string, any> = {};
    if (isCustomJson) {
      try {
        configPayload = JSON.parse(customJson);
      } catch {
        setErrorMsg('Invalid JSON in custom configuration.');
        return;
      }
    } else {
      configPayload = {
        board: board.trim(),
        curriculum: curriculum.trim(),
        timezone: timezone.trim() || 'Asia/Kolkata',
      };
    }

    // Validate mandatory Administrator fields
    const uName = adminUsername.trim();
    const pwd = adminPassword.trim();
    const email = adminEmail.trim();
    const mobDigits = adminMobile.replace(/\D/g, '');

    if (!uName || !pwd) {
      setErrorMsg('Administrator username and temporary password are required.');
      return;
    }
    if (!email) {
      setErrorMsg('Administrator email address is compulsory.');
      return;
    }
    // Check 10 digits after +91
    const isTenDigits = mobDigits.length === 10 || (mobDigits.length === 12 && mobDigits.startsWith('91'));
    if (!adminMobile || !isTenDigits) {
      setErrorMsg('A valid 10-digit Indian mobile number (+91) is compulsory for the administrator.');
      return;
    }

    // Build unified payload
    const payload: SchoolCreateInput = {
      name: trimmedName,
      max_students: Number(maxStudents) > 0 ? Number(maxStudents) : 500,
      max_teachers: Number(maxTeachers) > 0 ? Number(maxTeachers) : 50,
      config: configPayload,
      admin: {
        username: uName,
        password: pwd,
        email: email,
        mobile_number: adminMobile.startsWith('+91') ? adminMobile : `+91${mobDigits.slice(-10)}`,
        first_name: adminFirstName.trim() || undefined,
        last_name: adminLastName.trim() || undefined,
      },
    };

    setIsSubmitting(true);
    try {
      const created = await usersApi.createSchool(payload);
      onSchoolCreated(created);
      onClose();
      // Reset fields
      setName('');
      setBoard('CBSE');
      setCurriculum('NCERT');
      setMaxStudents(500);
      setMaxTeachers(50);
      setAdminUsername('');
      setAdminPassword('');
      setAdminEmail('');
      setAdminMobile('');
      setAdminFirstName('');
      setAdminLastName('');
    } catch (err: any) {
      const data = err.response?.data;
      let detail = err.message || 'Failed to create school.';
      if (typeof data === 'string') {
        detail = data;
      } else if (data && typeof data === 'object') {
        if (data.detail) detail = data.detail;
        else if (data.name) detail = Array.isArray(data.name) ? data.name[0] : String(data.name);
        else if (data.admin) {
          const adminErr = data.admin;
          if (typeof adminErr === 'object') {
            detail = Object.entries(adminErr)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`)
              .join(' | ');
          } else {
            detail = String(adminErr);
          }
        } else if (data.non_field_errors) {
          detail = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : String(data.non_field_errors);
        } else {
          detail = Object.values(data).flat().join(' ');
        }
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

      {/* Slide-over Drawer */}
      <div className="relative z-10 w-full sm:max-w-lg md:max-w-xl bg-surface border-l border-border h-full shadow-float flex flex-col justify-between animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg text-ink">
                Register School & Administrator
              </h2>
              <p className="text-xs text-ink/65">
                Register a new institutional tenant and its designated school administrator at once.
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

        {/* Drawer Form Body */}
        <form onSubmit={handleSubmit} id="create-school-form" className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Institution Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <span className="w-2 h-2 rounded-full bg-forest" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink/60">
                1. Institutional Partition
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="school-name" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                Institution Name *
              </label>
              <input
                id="school-name"
                type="text"
                required
                placeholder="e.g. Greenwood High International"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-xs text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none"
              />
            </div>

            {/* Academic & Curriculum Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <SearchableSelect
                id="school-board"
                label="Education Board"
                value={board}
                onChange={setBoard}
                options={INDIAN_BOARDS}
                placeholder="Select Indian board..."
                disabled={isSubmitting}
                required
              />

              <SearchableSelect
                id="school-curriculum"
                label="Default Curriculum"
                value={curriculum}
                onChange={setCurriculum}
                options={INDIAN_CURRICULA}
                placeholder="Select curriculum..."
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Quota & Capacity Controls (Super Admin Exclusive) */}
            <div className="pt-2">
              <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                Institutional Capacity Quotas (Super Admin Governed)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-surface-muted/40 border border-border rounded-card p-3">
                <div className="space-y-1">
                  <label htmlFor="school-max-students" className="block text-[11px] font-medium text-ink/80">
                    Max Allowed Students *
                  </label>
                  <input
                    id="school-max-students"
                    type="number"
                    min="1"
                    max="50000"
                    required
                    value={maxStudents}
                    onChange={(e) => setMaxStudents(parseInt(e.target.value) || 0)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                    placeholder="e.g. 500"
                  />
                  <p className="text-[10px] text-ink/50">Total student limit for entire school</p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="school-max-teachers" className="block text-[11px] font-medium text-ink/80">
                    Max Allowed Teachers *
                  </label>
                  <input
                    id="school-max-teachers"
                    type="number"
                    min="1"
                    max="5000"
                    required
                    value={maxTeachers}
                    onChange={(e) => setMaxTeachers(parseInt(e.target.value) || 0)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                    placeholder="e.g. 50"
                  />
                  <p className="text-[10px] text-ink/50">Total faculty limit for entire school</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Atomic School Administrator Account */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 pb-1">
              <span className="w-2 h-2 rounded-full bg-ember" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink/60">
                2. Designated School Administrator *
              </span>
            </div>

            <div className="space-y-3.5 bg-surface-muted/30 border border-border rounded-card p-4">
              <div className="flex items-center gap-2 text-xs text-ink/70">
                <UserPlus className="w-3.5 h-3.5 text-ember" />
                <span>Provision primary administrator credentials with school-wide governance (mandatory).</span>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="admin-firstname" className="block font-heading text-xs font-medium text-ink">
                    First Name
                  </label>
                  <input
                    id="admin-firstname"
                    type="text"
                    placeholder="e.g. Sarah"
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="admin-lastname" className="block font-heading text-xs font-medium text-ink">
                    Last Name
                  </label>
                  <input
                    id="admin-lastname"
                    type="text"
                    placeholder="e.g. Jenkins"
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>
              </div>

              {/* Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="admin-username" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Username *
                  </label>
                  <input
                    id="admin-username"
                    type="text"
                    required
                    placeholder="e.g. sjenkins_admin"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink font-mono focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-password" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Password *
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  />
                </div>
              </div>

              {/* Compulsory Contact Information: Email & Mobile Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label htmlFor="admin-email" className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Email Address *
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    required
                    placeholder="admin@school.edu"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none font-mono"
                  />
                </div>

                <PhoneInput
                  id="admin-mobile"
                  label="Mobile Number *"
                  required
                  value={adminMobile}
                  onChange={setAdminMobile}
                  disabled={isSubmitting}
                  placeholder="98765 43210"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Drawer Footer Actions */}
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
            form="create-school-form"
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Registering...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Register School & Administrator</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
