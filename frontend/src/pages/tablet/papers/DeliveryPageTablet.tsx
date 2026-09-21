import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import { classesApi } from '../../../api/classes';
import { useAuth } from '../../../auth/AuthContext';
import type { Delivery, PaperVersion, User, ClassSection } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';
import { GraduationCap, Users } from 'lucide-react';
import { CustomSelect } from '../../../components/ui/custom-select';
import { useToast } from '../../../context/ToastContext';

export const DeliveryPageTablet: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const { dashboardPath } = useAuth();
  const toast = useToast();

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [mode, setMode] = useState<'ONLINE' | 'PRINT'>('ONLINE');
  const [assignmentType, setAssignmentType] = useState<'class' | 'individual'>('class');
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdDelivery, setCreatedDelivery] = useState<Delivery | null>(null);

  useEffect(() => {
    const loadVersionAndStudents = async () => {
      setIsLoading(true);
      try {
        const [vData, studentList, classList] = await Promise.all([
          papersApi.getPaperVersion(paperId, vId),
          usersApi.getAllUsers({ role: 'Student' }),
          classesApi.getClasses(),
        ]);
        setVersion(vData);
        setStudents(studentList);
        setClasses(classList);

        if (classList.length > 0) {
          const firstClassId = classList[0].id;
          setSelectedClassId(firstClassId);
          const enrolled = studentList.filter((s) => s.class_section === firstClassId).map((s) => s.id);
          setSelectedStudentIds(enrolled);
        } else {
          setAssignmentType('individual');
        }
      } catch (err: any) {
        toast.error(
          err.response?.data?.detail || 'Failed to load paper version, students or classes list.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId && vId) {
      loadVersionAndStudents();
    }
  }, [paperId, vId]);

  const handleClassSelect = (classId: number | '') => {
    setSelectedClassId(classId);
    if (classId) {
      const classStudents = students.filter((s) => s.class_section === Number(classId));
      setSelectedStudentIds(classStudents.map((s) => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleStudentToggle = (studentId: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((sId) => sId !== studentId) : [...prev, studentId]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map((s) => s.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'ONLINE' && selectedStudentIds.length === 0 && (!selectedClassId || assignmentType !== 'class')) {
      toast.warning('Please assign at least one student or a valid class division for online test delivery.');
      return;
    }

    setIsSubmitting(true);
    try {
      const deliveryPayload: any = {
        mode,
      };

      if (mode === 'ONLINE') {
        if (assignmentType === 'class' && selectedClassId) {
          deliveryPayload.class_section_id = Number(selectedClassId);
        }
        deliveryPayload.student_ids = selectedStudentIds;

        if (availableFrom) {
          deliveryPayload.available_from = new Date(availableFrom).toISOString();
        }
        if (availableUntil) {
          deliveryPayload.available_until = new Date(availableUntil).toISOString();
        }
      }

      const delivery = await papersApi.deliverVersion(paperId, vId, deliveryPayload);
      setCreatedDelivery(delivery);
      toast.success(`Delivery #${delivery.id} created successfully for ${mode} exam.`);
    } catch (err: any) {
      const detail =
        err.response?.data?.student_ids?.[0] ||
        err.response?.data?.available_until?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to create test delivery.';
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (classFilter !== 'ALL') {
      if (classFilter === 'UNASSIGNED') {
        if (s.class_section) return false;
      } else if (s.class_section !== Number(classFilter)) {
        return false;
      }
    }
    if (!studentSearch.trim()) return true;
    const query = studentSearch.toLowerCase();
    const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
    return (
      s.username.toLowerCase().includes(query) ||
      fullName.includes(query) ||
      (s.email && s.email.toLowerCase().includes(query))
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="deliver" paperId={paperId} versionId={vId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60 text-sm">
          Loading delivery parameters...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-body pb-16">
      <PaperWorkflowNavTablet
        currentStep="deliver"
        paperId={paperId}
        paperTitle={version?.paper_title}
        versionId={vId}
        versionLabel={version?.version_label}
      />

      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Stage 05 • Test Deployment
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Schedule & Deliver Assessment
        </h1>
        <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
          Configure delivery mode and assign candidates via tablet touch.
        </p>
      </div>

      {/* Success State */}
      {createdDelivery && (
        <div
          id="delivery-success-banner"
          className="bg-forest text-white rounded-card p-6 shadow-float space-y-4"
        >
          <span className="pill pill-lime text-xs font-bold">
            Delivery #{createdDelivery.id} Dispatched
          </span>

          <h2 className="font-heading font-bold text-2xl text-white">
            {createdDelivery.mode === 'ONLINE' ? 'Online Test Deployed' : 'Print Package Generated'}
          </h2>

          {createdDelivery.target_class_name && (
            <div className="text-xs font-semibold text-lime">
              🎯 Targeted Division: Class {createdDelivery.target_class_name}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/20">
            <Link
              to={dashboardPath}
              className="px-5 py-2.5 rounded-pill bg-surface text-ink text-xs font-heading font-semibold hover:bg-bg min-h-[44px] flex items-center"
            >
              Dashboard
            </Link>

            {createdDelivery.mode === 'ONLINE' && (
              <Link
                to={`/deliveries/${createdDelivery.id}/results`}
                className="px-5 py-2.5 rounded-pill bg-ember text-white text-xs font-heading font-semibold hover:bg-ember/90 min-h-[44px] flex items-center"
              >
                View Results Roster →
              </Link>
            )}

            {createdDelivery.mode === 'PRINT' && (
              <Link
                to={`/papers/${paperId}/versions/${vId}/print`}
                className="px-5 py-2.5 rounded-pill bg-lime text-ink text-xs font-heading font-semibold hover:bg-lime/90 min-h-[44px] flex items-center"
              >
                Open Print View ↗
              </Link>
            )}
          </div>
        </div>
      )}

      {!createdDelivery && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── 2-Column Bento Reflow ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            
            {/* Column 1: Tactile Mode Cards & Scheduling */}
            <div className="space-y-5">
              <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
                <h3 className="font-heading font-bold text-base text-ink border-b border-border pb-2">
                  Delivery Mode *
                </h3>

                <div className="space-y-3">
                  <div
                    onClick={() => setMode('ONLINE')}
                    className={`p-4 rounded-card border-2 transition-all cursor-pointer min-h-[64px] flex items-center justify-between ${
                      mode === 'ONLINE'
                        ? 'border-forest bg-surface shadow-sm'
                        : 'border-border bg-bg hover:bg-surface-muted'
                    }`}
                  >
                    <div>
                      <div className="font-heading font-bold text-sm text-ink">
                        Interactive Online Test
                      </div>
                      <div className="text-xs text-ink/60">
                        Students sit online with timers and auto-grading
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="delivery-mode"
                      value="ONLINE"
                      checked={mode === 'ONLINE'}
                      onChange={() => setMode('ONLINE')}
                      className="accent-forest"
                    />
                  </div>

                  <div
                    onClick={() => setMode('PRINT')}
                    className={`p-4 rounded-card border-2 transition-all cursor-pointer min-h-[64px] flex items-center justify-between ${
                      mode === 'PRINT'
                        ? 'border-ember bg-surface shadow-sm'
                        : 'border-border bg-bg hover:bg-surface-muted'
                    }`}
                  >
                    <div>
                      <div className="font-heading font-bold text-sm text-ink">
                        Physical Paper Printout
                      </div>
                      <div className="text-xs text-ink/60">
                        High-contrast proctored exam sheets
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="delivery-mode"
                      value="PRINT"
                      checked={mode === 'PRINT'}
                      onChange={() => setMode('PRINT')}
                      className="accent-ember"
                    />
                  </div>
                </div>
              </div>

              {/* Scheduling Cards */}
              {mode === 'ONLINE' && (
                <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-3">
                  <h3 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">
                    Availability Window
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="avail-from" className="block text-[11px] font-mono text-ink/60 mb-1">
                        Available From
                      </label>
                      <input
                        id="avail-from"
                        type="datetime-local"
                        value={availableFrom}
                        onChange={(e) => setAvailableFrom(e.target.value)}
                        disabled={isSubmitting}
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label htmlFor="avail-until" className="block text-[11px] font-mono text-ink/60 mb-1">
                        Available Until
                      </label>
                      <input
                        id="avail-until"
                        type="datetime-local"
                        value={availableUntil}
                        onChange={(e) => setAvailableUntil(e.target.value)}
                        disabled={isSubmitting}
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Touch-Optimized Student Picker (ONLINE mode) */}
            {mode === 'ONLINE' && (
              <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h3 className="font-heading font-bold text-base text-ink">
                      Assign Examination Audience *
                    </h3>
                    <p className="text-xs text-ink/60">
                      Target by classroom division or custom students
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="pill pill-grape text-[10px]">
                      {selectedStudentIds.length} Selected
                    </span>
                  </div>
                </div>

                {/* Assignment Strategy Segmented Control */}
                <div className="flex items-center gap-2 p-1 bg-surface-muted rounded-pill border border-border w-fit">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignmentType('class');
                      if (classes.length > 0 && selectedClassId) {
                        handleClassSelect(selectedClassId);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-pill text-xs font-heading font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      assignmentType === 'class'
                        ? 'bg-forest text-white shadow-xs'
                        : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>By Class Section</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignmentType('individual')}
                    className={`px-3 py-1.5 rounded-pill text-xs font-heading font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      assignmentType === 'individual'
                        ? 'bg-grape text-white shadow-xs'
                        : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Custom Selection</span>
                  </button>
                </div>

                {/* Mode 1: Class Divisions */}
                {assignmentType === 'class' && (
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {classes.map((cls) => {
                      const isSelected = selectedClassId === cls.id;
                      return (
                        <div
                          key={cls.id}
                          onClick={() => handleClassSelect(cls.id)}
                          className={`p-3 rounded-card border-2 transition-all cursor-pointer space-y-1 ${
                            isSelected
                              ? 'border-forest bg-forest/10 shadow-sm'
                              : 'border-border bg-bg hover:bg-surface-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-heading font-bold text-base text-ink">
                              Class {cls.name}
                            </span>
                            <span className="pill pill-forest text-[10px]">
                              {cls.student_count} / {cls.max_students} students
                            </span>
                          </div>
                          {cls.class_teacher_name && (
                            <div className="text-[11px] text-ink/60">
                              👨‍🏫 Class Teacher: {cls.class_teacher_name} ({cls.class_teacher_subject || 'General'})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Mode 2: Individual Candidates */}
                {assignmentType === 'individual' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Search students..."
                        className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-grape focus:outline-none min-h-[40px]"
                      />
                      <CustomSelect
                        value={classFilter}
                        onChange={(val) => setClassFilter(val)}
                        options={[
                          { value: 'ALL', label: 'All Divisions' },
                          ...classes.map((c) => ({
                            value: String(c.id),
                            label: `Class ${c.name}`,
                          })),
                          { value: 'UNASSIGNED', label: 'Unassigned' },
                        ]}
                        placeholder="Filter by Division..."
                        className="w-full"
                      />
                    </div>

                    <div className="flex justify-between items-center text-xs text-ink/60">
                      <span>{filteredStudents.length} candidates</span>
                      {filteredStudents.length > 0 && (
                        <button
                          type="button"
                          onClick={handleSelectAllStudents}
                          className="text-xs font-heading font-semibold text-forest hover:underline"
                        >
                          {selectedStudentIds.length === filteredStudents.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {filteredStudents.map((s) => {
                        const isSelected = selectedStudentIds.includes(s.id);
                        const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
                        const initials = (s.username[0] || '?').toUpperCase();

                        return (
                          <div
                            key={s.id}
                            onClick={() => handleStudentToggle(s.id)}
                            className={`p-3 rounded-card border flex items-center justify-between gap-3 cursor-pointer min-h-[48px] active:scale-[0.99] transition-all ${
                              isSelected
                                ? 'border-grape bg-grape/10'
                                : 'border-border bg-bg hover:bg-surface-muted'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isSelected ? 'bg-grape text-white' : 'bg-surface border border-border text-ink'
                                }`}
                              >
                                {initials}
                              </div>
                              <div className="truncate text-xs">
                                <div className="font-heading font-semibold text-ink truncate">
                                  {fullName || s.username}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-ink/50 truncate">
                                    @{s.username}
                                  </span>
                                  {s.class_section_name && (
                                    <span className="pill text-[9px] bg-forest/15 text-forest border border-forest/20">
                                      Class {s.class_section_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleStudentToggle(s.id)}
                              className="accent-grape w-4 h-4 shrink-0 pointer-events-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Print Mode Explanation */}
            {mode === 'PRINT' && (
              <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-3">
                <span className="pill pill-ember text-[10px]">Print Delivery Record</span>
                <h3 className="font-heading font-bold text-base text-ink">
                  Physical Examination Packaging
                </h3>
                <p className="text-xs text-ink/70 leading-relaxed">
                  Logging this delivery generates an official in-person test session with no individual student login required.
                </p>
              </div>
            )}

          </div>

          {/* Action Toolbar */}
          <div className="bg-surface border border-border rounded-card p-4 shadow-card flex items-center justify-between gap-4">
            <Link
              to={`/papers/${paperId}/versions/${vId}`}
              className="px-4 py-2.5 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-surface-muted min-h-[44px] flex items-center"
            >
              Cancel
            </Link>

            <button
              type="submit"
              id="submit-delivery-btn"
              disabled={isSubmitting}
              className="px-6 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center gap-2"
            >
              <span>{isSubmitting ? 'Deploying...' : 'Confirm & Deploy Test'}</span>
              <span>→</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
