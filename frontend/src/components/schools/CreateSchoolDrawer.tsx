import React, { useState } from 'react';
import { usersApi } from '../../api/users';
import type { School } from '../../types';
import { X, Building2, Check, AlertCircle } from 'lucide-react';
import { SearchableSelect } from '../ui/searchable-select';
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
  const [name, setName] = useState('');
  const [board, setBoard] = useState('CBSE');
  const [curriculum, setCurriculum] = useState('NCERT');
  // System timezone is fixed to 'Asia/Kolkata' for Indian institutions (hidden from UI)
  const [timezone] = useState('Asia/Kolkata');
  // Tenant custom JSON configuration preserved for future expansion (hidden from UI)
  const [isCustomJson] = useState(false);
  const [customJson] = useState('{}');
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

    setIsSubmitting(true);
    try {
      const created = await usersApi.createSchool({
        name: trimmedName,
        config: configPayload,
      });
      onSchoolCreated(created);
      onClose();
      // Reset fields
      setName('');
      setBoard('CBSE');
      setCurriculum('NCERT');
    } catch (err: any) {
      const data = err.response?.data;
      let detail = err.message || 'Failed to create school.';
      if (typeof data === 'string') {
        detail = data;
      } else if (data && typeof data === 'object') {
        if (data.detail) detail = data.detail;
        else if (data.name) detail = Array.isArray(data.name) ? data.name[0] : String(data.name);
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

      {/* Slide-over Drawer */}
      <div className="relative z-10 w-full sm:max-w-md md:max-w-lg bg-surface border-l border-border h-full shadow-float flex flex-col justify-between animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg text-ink">
                Create New School
              </h2>
              <p className="text-xs text-ink/65">
                Register a new institutional tenant partition
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
        <form onSubmit={handleSubmit} id="create-school-form" className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

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
          <div className="space-y-4 pt-2 border-t border-border">
            {/* Education Board Searchable Dropdown */}
            <SearchableSelect
              id="school-board"
              label="Education Board"
              value={board}
              onChange={setBoard}
              options={INDIAN_BOARDS}
              placeholder="Search Indian education board..."
              disabled={isSubmitting}
              required
            />

            {/* Default Curriculum Searchable Dropdown */}
            <SearchableSelect
              id="school-curriculum"
              label="Default Curriculum"
              value={curriculum}
              onChange={setCurriculum}
              options={INDIAN_CURRICULA}
              placeholder="Search default curriculum..."
              disabled={isSubmitting}
              required
            />
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
              <span>Registering School...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Register Institution</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
