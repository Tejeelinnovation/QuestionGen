import React, { useState, useEffect } from 'react';
import { X, Building2, Users, GraduationCap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usersApi } from '../../api/users';
import type { School } from '../../types';

interface EditSchoolModalProps {
  school: School | null;
  isOpen: boolean;
  onClose: () => void;
  onSchoolUpdated: () => void;
}

export const EditSchoolModal: React.FC<EditSchoolModalProps> = ({
  school,
  isOpen,
  onClose,
  onSchoolUpdated,
}) => {
  const [name, setName] = useState('');
  const [maxStudents, setMaxStudents] = useState<number>(500);
  const [maxTeachers, setMaxTeachers] = useState<number>(50);
  const [questionBankEnabled, setQuestionBankEnabled] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (school) {
      setName(school.name || '');
      setMaxStudents(school.max_students ?? 500);
      setMaxTeachers(school.max_teachers ?? 50);
      setQuestionBankEnabled(Boolean(school.question_bank_enabled));
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [school, isOpen]);

  if (!isOpen || !school) return null;

  const currentStudents = school.student_count ?? 0;
  const currentTeachers = school.teacher_count ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setErrorMessage('School / Coaching Class name cannot be empty.');
      return;
    }

    if (maxStudents < 1) {
      setErrorMessage('Student quota must be at least 1.');
      return;
    }

    if (maxTeachers < 1) {
      setErrorMessage('Teacher quota must be at least 1.');
      return;
    }

    if (maxStudents < currentStudents) {
      setErrorMessage(
        `Student quota (${maxStudents}) cannot be less than currently enrolled students (${currentStudents}).`
      );
      return;
    }

    if (maxTeachers < currentTeachers) {
      setErrorMessage(
        `Teacher quota (${maxTeachers}) cannot be less than currently active teachers (${currentTeachers}).`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await usersApi.updateSchool(school.id, {
        name: name.trim(),
        max_students: Number(maxStudents),
        max_teachers: Number(maxTeachers),
        question_bank_enabled: questionBankEnabled,
      });

      setSuccessMessage('Organization settings & quotas updated successfully!');
      setTimeout(() => {
        onSchoolUpdated();
        onClose();
      }, 600);
    } catch (err: any) {
      const data = err.response?.data;
      let msg = 'Failed to update school quotas.';
      if (typeof data === 'string') msg = data;
      else if (data?.detail) msg = data.detail;
      else if (data?.max_students) msg = data.max_students.join(' ');
      else if (data?.max_teachers) msg = data.max_teachers.join(' ');
      else if (data?.name) msg = data.name.join(' ');
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface border border-border rounded-card max-w-lg w-full shadow-float overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-ink">Edit School / Coaching Class</h3>
              <p className="text-[11px] text-ink/50 font-mono">ID #{school.id} • {school.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-card bg-ember/10 border border-ember/20 text-ember text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-card bg-forest/10 border border-forest/20 text-forest text-xs flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* School Name */}
          <div className="space-y-1">
            <label className="text-xs font-heading font-semibold text-ink">School / Coaching Class Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-card bg-bg border border-border text-xs focus:border-forest focus:outline-none"
              placeholder="e.g. Greenwood International High"
              required
            />
          </div>

          {/* Current Enrollment Summary */}
          <div className="p-3 rounded-card bg-surface-muted border border-border grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-ink/50 uppercase font-mono block">Enrolled Students</span>
              <span className="font-heading font-bold text-forest text-sm">{currentStudents}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink/50 uppercase font-mono block">Active Teachers</span>
              <span className="font-heading font-bold text-grape text-sm">{currentTeachers}</span>
            </div>
          </div>

          {/* Quotas inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-heading font-semibold text-ink flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-forest" />
                <span>Max Student Quota</span>
              </label>
              <input
                type="number"
                min={currentStudents || 1}
                value={maxStudents}
                onChange={(e) => setMaxStudents(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-card bg-bg border border-border text-xs focus:border-forest focus:outline-none font-mono"
                required
              />
              <span className="text-[10px] text-ink/50 block">Minimum allowable: {currentStudents || 1}</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-heading font-semibold text-ink flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-grape" />
                <span>Max Teacher Quota</span>
              </label>
              <input
                type="number"
                min={currentTeachers || 1}
                value={maxTeachers}
                onChange={(e) => setMaxTeachers(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-card bg-bg border border-border text-xs focus:border-forest focus:outline-none font-mono"
                required
              />
              <span className="text-[10px] text-ink/50 block">Minimum allowable: {currentTeachers || 1}</span>
            </div>
          </div>

          {/* Question Bank Feature Access Toggle (AC-11) */}
          <div className="bg-surface-muted/40 border border-border rounded-card p-3.5 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-heading font-semibold text-ink block">
                Question Bank Capability (AC-11)
              </span>
              <span className="text-[11px] text-ink/65 block">
                Allow organization and its teachers to generate and select questions.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                id="edit-school-question-bank-enabled"
                checked={questionBankEnabled}
                onChange={(e) => setQuestionBankEnabled(e.target.checked)}
                disabled={isSubmitting}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
            </label>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border hover:bg-surface-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
