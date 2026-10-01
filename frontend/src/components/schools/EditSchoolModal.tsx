import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
  UploadCloud,
} from 'lucide-react';
import { usersApi, type SchoolUploadPolicyResponse } from '../../api/users';
import { useToast } from '../../context/ToastContext';
import type { School } from '../../types';
import { SkeletonPolicyCards } from '../ui/skeleton';

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
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'quotas' | 'upload_policy'>('quotas');
  const [name, setName] = useState('');
  const [maxStudents, setMaxStudents] = useState<number>(500);
  const [maxTeachers, setMaxTeachers] = useState<number>(50);
  const [questionBankEnabled, setQuestionBankEnabled] = useState<boolean>(false);
  const [validationWorkflowEnabled, setValidationWorkflowEnabled] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bulk Upload Policy State
  const [uploadPolicy, setUploadPolicy] = useState<SchoolUploadPolicyResponse | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState<boolean>(false);
  const [policyUpdatingGroup, setPolicyUpdatingGroup] = useState<string | null>(null);
  const [conflictData, setConflictData] = useState<{
    roleGroup: 'teachers' | 'students' | 'school_admins';
    roleLabel: string;
    priorUsers: { id: number; username: string; name: string }[];
  } | null>(null);

  const fetchUploadPolicy = async (schoolId: number) => {
    setIsLoadingPolicy(true);
    try {
      const data = await usersApi.getSchoolUploadPolicy(schoolId);
      setUploadPolicy(data);
    } catch (err) {
      console.error('Failed to load school upload policy', err);
    } finally {
      setIsLoadingPolicy(false);
    }
  };

  useEffect(() => {
    if (school && isOpen) {
      setName(school.name || '');
      setMaxStudents(school.max_students ?? 500);
      setMaxTeachers(school.max_teachers ?? 50);
      setQuestionBankEnabled(Boolean(school.question_bank_enabled));
      setValidationWorkflowEnabled(Boolean(school.validation_workflow_enabled));
      setErrorMessage(null);
      setSuccessMessage(null);
      setActiveTab('quotas');
      setConflictData(null);
      fetchUploadPolicy(school.id);
    }
  }, [school, isOpen]);

  if (!isOpen || !school) return null;

  const currentStudents = school.student_count ?? 0;
  const currentTeachers = school.teacher_count ?? 0;

  const handleTogglePolicy = (
    roleGroup: 'teachers' | 'students' | 'school_admins',
    roleLabel: string,
    currentEnabled: boolean
  ) => {
    if (currentEnabled) {
      // Trying to disable: check if prior individual grants existed
      const priorUsers = uploadPolicy?.[roleGroup]?.prior_users || [];
      if (priorUsers.length > 0) {
        // Trigger conflict resolution modal!
        setConflictData({
          roleGroup,
          roleLabel,
          priorUsers,
        });
        return;
      }
      // No prior users: simply execute disable
      handleExecuteToggleOff(roleGroup, false);
    } else {
      // Enabling bulk access
      handleExecuteToggleOn(roleGroup);
    }
  };

  const handleExecuteToggleOn = async (roleGroup: 'teachers' | 'students' | 'school_admins') => {
    if (!school) return;
    setPolicyUpdatingGroup(roleGroup);
    try {
      const updated = await usersApi.setSchoolUploadPolicy(school.id, {
        role_group: roleGroup,
        enabled: true,
      });
      setUploadPolicy(updated);
      toast.success(`Bulk upload permission enabled for all ${roleGroup.replace('_', ' ')}!`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to enable bulk upload permission.');
    } finally {
      setPolicyUpdatingGroup(null);
    }
  };

  const handleExecuteToggleOff = async (
    roleGroup: 'teachers' | 'students' | 'school_admins',
    preservePrior: boolean
  ) => {
    if (!school) return;
    setPolicyUpdatingGroup(roleGroup);
    try {
      const updated = await usersApi.setSchoolUploadPolicy(school.id, {
        role_group: roleGroup,
        enabled: false,
        preserve_prior_grants: preservePrior,
      });
      setUploadPolicy(updated);
      setConflictData(null);
      if (preservePrior) {
        toast.success(
          `Bulk access disabled. Preserved permissions for prior individual holders.`
        );
      } else {
        toast.success(`Bulk access disabled and permissions revoked for all.`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update bulk upload permission.');
    } finally {
      setPolicyUpdatingGroup(null);
    }
  };

  const handleSubmitQuotas = async (e: React.FormEvent) => {
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
        validation_workflow_enabled: validationWorkflowEnabled,
      });

      setSuccessMessage('Organization settings & quotas updated successfully!');
      toast.success('Organization settings & quotas updated successfully!');
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
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-float overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between shrink-0 bg-surface-muted/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-forest/10 border border-forest/20 flex items-center justify-center text-forest shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading font-bold text-sm text-ink truncate">
                {school.name}
              </h3>
              <p className="text-[11px] text-ink/50 font-mono">
                Tenant #{school.id} • {school.config?.board || 'Standard'} ({school.config?.curriculum || 'NCERT'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border px-3 sm:px-4 bg-surface-muted/20 shrink-0 overflow-x-auto no-scrollbar gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('quotas')}
            className={`py-2.5 px-3 sm:px-4 text-xs font-heading font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'quotas'
                ? 'border-forest text-forest bg-surface'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Quotas & Features</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload_policy')}
            className={`py-2.5 px-3 sm:px-4 text-xs font-heading font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'upload_policy'
                ? 'border-forest text-forest bg-surface'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Study Material Bulk Policy</span>
          </button>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === 'quotas' ? (
            <form onSubmit={handleSubmitQuotas} className="space-y-4">
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
                <label className="text-xs font-heading font-semibold text-ink">
                  School / Coaching Class Name
                </label>
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

              {/* Question Bank Feature Access Toggle */}
              <div className="bg-surface-muted/40 border border-border rounded-card p-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-heading font-semibold text-ink block">
                    Question Bank Capability
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

              {/* QBM Validation Workflow Toggle */}
              <div className="bg-surface-muted/40 border border-border rounded-card p-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-heading font-semibold text-ink block">
                    Enable QBM Validation Workflow (DEO → Validator)
                  </span>
                  <span className="text-[11px] text-ink/65 block">
                    When enabled, questions entered pass through DEO and Validator before becoming eligible.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    id="edit-school-validation-workflow-enabled"
                    checked={validationWorkflowEnabled}
                    onChange={(e) => setValidationWorkflowEnabled(e.target.checked)}
                    disabled={isSubmitting}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
                </label>
              </div>

              {/* Submit Buttons */}
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
          ) : (
            /* Study Material Bulk Policy Tab */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-forest/20 bg-forest/5 flex items-start gap-2.5">
                <UploadCloud className="w-5 h-5 text-forest shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs text-ink/80">
                  <p className="font-heading font-bold text-ink">
                    School-Wide Study Material Upload Policy
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Instantly grant or revoke PDF study material submission permissions for all members in a role without editing each user individually.
                  </p>
                </div>
              </div>

              {isLoadingPolicy ? (
                <SkeletonPolicyCards />
              ) : (
                <div className="space-y-3">
                  {/* Teachers Bulk Toggle */}
                  <div className="p-3.5 rounded-xl border border-border bg-surface hover:border-forest/30 transition-all space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-grape/10 text-grape flex items-center justify-center">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-xs text-ink">All Teachers</span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                uploadPolicy?.teachers?.enabled
                                  ? 'bg-emerald-500/10 text-emerald-700'
                                  : 'bg-surface-muted text-ink/60'
                              }`}
                            >
                              {uploadPolicy?.teachers?.enabled
                                ? `Bulk Enabled (${uploadPolicy?.teachers?.active_with_permission}/${uploadPolicy?.teachers?.total_count})`
                                : `Disabled (${uploadPolicy?.teachers?.active_with_permission}/${uploadPolicy?.teachers?.total_count} active)`}
                            </span>
                          </div>
                          <p className="text-[11px] text-ink/60">
                            Allow all authoring teachers in this school to upload textbooks & study notes.
                          </p>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(uploadPolicy?.teachers?.enabled)}
                          onChange={() =>
                            handleTogglePolicy(
                              'teachers',
                              'Teachers',
                              Boolean(uploadPolicy?.teachers?.enabled)
                            )
                          }
                          disabled={policyUpdatingGroup === 'teachers'}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
                      </label>
                    </div>

                    {uploadPolicy?.teachers?.prior_users && uploadPolicy.teachers.prior_users.length > 0 && (
                      <div className="text-[10px] text-ink/60 bg-surface-muted px-2.5 py-1 rounded-md flex items-center justify-between">
                        <span>Pre-existing individual grants:</span>
                        <span className="font-mono font-bold text-forest">
                          {uploadPolicy.teachers.prior_users.map((u) => `@${u.username}`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Students Bulk Toggle */}
                  <div className="p-3.5 rounded-xl border border-border bg-surface hover:border-forest/30 transition-all space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-lime/20 text-forest flex items-center justify-center">
                          <GraduationCap className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-xs text-ink">All Students</span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                uploadPolicy?.students?.enabled
                                  ? 'bg-emerald-500/10 text-emerald-700'
                                  : 'bg-surface-muted text-ink/60'
                              }`}
                            >
                              {uploadPolicy?.students?.enabled
                                ? `Bulk Enabled (${uploadPolicy?.students?.active_with_permission}/${uploadPolicy?.students?.total_count})`
                                : `Disabled (${uploadPolicy?.students?.active_with_permission}/${uploadPolicy?.students?.total_count} active)`}
                            </span>
                          </div>
                          <p className="text-[11px] text-ink/60">
                            Allow enrolled candidates to submit study material and handwritten notes.
                          </p>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(uploadPolicy?.students?.enabled)}
                          onChange={() =>
                            handleTogglePolicy(
                              'students',
                              'Students',
                              Boolean(uploadPolicy?.students?.enabled)
                            )
                          }
                          disabled={policyUpdatingGroup === 'students'}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
                      </label>
                    </div>

                    {uploadPolicy?.students?.prior_users && uploadPolicy.students.prior_users.length > 0 && (
                      <div className="text-[10px] text-ink/60 bg-surface-muted px-2.5 py-1 rounded-md flex items-center justify-between">
                        <span>Pre-existing individual grants:</span>
                        <span className="font-mono font-bold text-forest">
                          {uploadPolicy.students.prior_users.map((u) => `@${u.username}`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* School Admins Bulk Toggle */}
                  <div className="p-3.5 rounded-xl border border-border bg-surface hover:border-forest/30 transition-all space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-ember/10 text-ember flex items-center justify-center">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-xs text-ink">School Administrators</span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                uploadPolicy?.school_admins?.enabled
                                  ? 'bg-emerald-500/10 text-emerald-700'
                                  : 'bg-surface-muted text-ink/60'
                              }`}
                            >
                              {uploadPolicy?.school_admins?.enabled
                                ? `Bulk Enabled (${uploadPolicy?.school_admins?.active_with_permission ?? 0}/${uploadPolicy?.school_admins?.total_count ?? 0})`
                                : `Disabled (${uploadPolicy?.school_admins?.active_with_permission ?? 0}/${uploadPolicy?.school_admins?.total_count ?? 0} active)`}
                            </span>
                          </div>
                          <p className="text-[11px] text-ink/60">
                            Allow institutional administrators to submit reference books and materials.
                          </p>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(uploadPolicy?.school_admins?.enabled)}
                          onChange={() =>
                            handleTogglePolicy(
                              'school_admins',
                              'School Admins',
                              Boolean(uploadPolicy?.school_admins?.enabled)
                            )
                          }
                          disabled={policyUpdatingGroup === 'school_admins'}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
                      </label>
                    </div>

                    {uploadPolicy?.school_admins?.prior_users && uploadPolicy.school_admins.prior_users.length > 0 && (
                      <div className="text-[10px] text-ink/60 bg-surface-muted px-2.5 py-1 rounded-md flex items-center justify-between">
                        <span>Pre-existing individual grants:</span>
                        <span className="font-mono font-bold text-forest">
                          {uploadPolicy.school_admins.prior_users.map((u) => `@${u.username}`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Conflict Resolution Modal (When turning OFF bulk access with prior individual grants) ── */}
      {conflictData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-ink/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-heading font-bold text-sm text-ink">
                  Prior Permissions Detected
                </h4>
                <p className="text-xs text-ink/60">
                  Disabling bulk access for {conflictData.roleLabel}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-2">
              <p className="text-xs text-ink/80 leading-relaxed font-body">
                The following <strong>{conflictData.priorUsers.length} user(s)</strong> already had individual upload permission <em>before</em> bulk access was enabled:
              </p>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {conflictData.priorUsers.map((u) => (
                  <div
                    key={u.id}
                    className="text-xs font-mono px-2.5 py-1 bg-surface rounded-lg border border-border/60 flex items-center justify-between"
                  >
                    <span className="font-bold text-ink">@{u.username}</span>
                    <span className="text-ink/60 text-[11px] truncate max-w-[160px]">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-ink/70 font-body">
              How would you like to handle their permissions?
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleExecuteToggleOff(conflictData.roleGroup, true)}
                className="w-full py-2.5 px-4 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Preserve Prior Permissions (Recommended)</span>
              </button>
              <p className="text-[10px] text-ink/50 text-center font-body">
                Keeps upload access for prior holders; revokes only for users granted by bulk.
              </p>

              <button
                type="button"
                onClick={() => handleExecuteToggleOff(conflictData.roleGroup, false)}
                className="w-full py-2.5 px-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-heading font-bold transition-all cursor-pointer active:scale-95"
              >
                <span>Revoke for Everyone</span>
              </button>

              <button
                type="button"
                onClick={() => setConflictData(null)}
                className="w-full py-2 px-3 text-xs text-ink/60 hover:text-ink transition-colors cursor-pointer text-center font-heading font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

