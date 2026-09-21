import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { usersApi } from '../../api/users';
import { classesApi } from '../../api/classes';
import type { Delivery, PaperVersion, User, ClassSection } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { DeliveryPageTablet } from '../tablet/papers/DeliveryPageTablet';
import { DeliveryPageMobile } from '../mobile/papers/DeliveryPageMobile';
import { GraduationCap, Users } from 'lucide-react';
import { CustomSelect } from '../../components/ui/custom-select';
import { extractApiErrorMessage } from '../../utils/errorUtils';

const DeliveryPageDesktop: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const [searchParams] = useSearchParams();
  const preselectedClassId = Number(searchParams.get('class_id') || searchParams.get('class_section_id'));
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
          const activeClassId = (preselectedClassId && classList.some((c) => c.id === preselectedClassId))
            ? preselectedClassId
            : classList[0].id;
          setSelectedClassId(activeClassId);
          const enrolled = studentList.filter((s) => s.class_section === activeClassId).map((s) => s.id);
          setSelectedStudentIds(enrolled);
        } else {
          setAssignmentType('individual');
        }
      } catch (err: any) {
        toast.error(extractApiErrorMessage(err, 'Failed to load paper version, students or classes list.'));
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
      const warn = 'Please assign at least one student or a valid class division for online test delivery.';
      toast.warning(warn);
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
      toast.error(extractApiErrorMessage(err, 'Failed to create test delivery.'));
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
      <div className="space-y-6">
        <PaperWorkflowNav currentStep="deliver" paperId={paperId} versionId={vId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60">
          Loading delivery parameters and student rosters...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Workflow Navigation */}
      <PaperWorkflowNav
        currentStep="deliver"
        paperId={paperId}
        paperTitle={version?.paper_title}
        versionId={vId}
        versionLabel={version?.version_label}
      />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Stage 05 • Examination Deployment
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Schedule & Deliver Test
          </h1>
          <p className="font-body text-ink/70 text-sm max-w-2xl leading-relaxed">
            Choose between physical print packaging or an online interactive exam session assigned directly to enrolled students.
          </p>
        </div>

        <Link
          to={`/papers/${paperId}/versions/${vId}`}
          className="text-xs font-heading font-semibold text-ink/70 hover:text-ink px-4 py-2 rounded-pill border border-border bg-surface hover:bg-surface-muted transition-colors self-start md:self-auto"
        >
          ← Version Snapshot
        </Link>
      </div>

      {/* ── SUCCESS STATE BANNER ── */}
      {createdDelivery && (
        <div
          id="delivery-success-banner"
          className="bg-forest text-white rounded-card p-7 sm:p-8 shadow-float space-y-5"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-lime animate-ping" />
            <span className="pill pill-lime text-xs font-bold uppercase tracking-wider">
              Delivery #{createdDelivery.id} Dispatched
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight text-white">
              {createdDelivery.mode === 'ONLINE'
                ? 'Online Test Session Deployed'
                : 'Print Examination Package Generated'}
            </h2>
            <p className="text-white/80 text-sm max-w-xl">
              Delivery #{createdDelivery.id} is now registered under Version {createdDelivery.version_label}.
              {createdDelivery.target_class_name && (
                <span className="block mt-1 font-semibold text-lime">
                  🎯 Targeted Classroom Division: Class {createdDelivery.target_class_name}
                </span>
              )}
              {createdDelivery.mode === 'ONLINE' && (
                <span> Assigned to {createdDelivery.assigned_students?.length || 0} candidate(s).</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-white/20">
            <Link
              to={dashboardPath}
              className="px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-surface text-ink hover:bg-bg transition-colors"
            >
              Dashboard
            </Link>

            {createdDelivery.mode === 'ONLINE' && (
              <Link
                to={`/deliveries/${createdDelivery.id}/results`}
                className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-ember text-white hover:bg-ember/90 transition-colors shadow-sm flex items-center gap-2"
              >
                <span>View Results Roster</span>
                <span>→</span>
              </Link>
            )}

            {createdDelivery.mode === 'PRINT' && (
              <Link
                to={`/papers/${paperId}/versions/${vId}/print`}
                className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-lime text-ink hover:bg-lime/90 transition-colors shadow-sm flex items-center gap-2"
              >
                <span>Open Restrained Print View</span>
                <span>↗</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── DELIVERY CONFIGURATION FORM ── */}
      {!createdDelivery && (
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* REQUIREMENT: TACTILE MODE SELECTION CARDS (NOT GENERIC RADIOS) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xs font-semibold text-ink uppercase tracking-wider">
                Select Delivery Mode *
              </span>
              <span className="font-mono text-[11px] text-ink/50">Tactile Choice</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Online Examination Card */}
              <div
                onClick={() => setMode('ONLINE')}
                className={`p-6 rounded-card border-2 transition-all cursor-pointer space-y-3 ${
                  mode === 'ONLINE'
                    ? 'border-forest bg-surface shadow-card scale-101'
                    : 'border-border bg-bg hover:bg-surface-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-lg text-ink">
                    Interactive Online Test
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery-mode"
                      value="ONLINE"
                      checked={mode === 'ONLINE'}
                      onChange={() => setMode('ONLINE')}
                      disabled={isSubmitting}
                      className="accent-forest"
                    />
                    <span
                      className={`pill text-[10px] ${
                        mode === 'ONLINE' ? 'pill-forest' : 'pill-muted'
                      }`}
                    >
                      Online
                    </span>
                  </label>
                </div>
                <p className="text-xs text-ink/70 leading-relaxed">
                  Students log in to sit the exam digitally with live countdown timers, randomized option display, and immediate objective grading.
                </p>
              </div>

              {/* Physical Print Paper Card */}
              <div
                onClick={() => setMode('PRINT')}
                className={`p-6 rounded-card border-2 transition-all cursor-pointer space-y-3 ${
                  mode === 'PRINT'
                    ? 'border-ember bg-surface shadow-card scale-101'
                    : 'border-border bg-bg hover:bg-surface-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-lg text-ink">
                    Physical Paper Printout
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery-mode"
                      value="PRINT"
                      checked={mode === 'PRINT'}
                      onChange={() => setMode('PRINT')}
                      disabled={isSubmitting}
                      className="accent-ember"
                    />
                    <span
                      className={`pill text-[10px] ${
                        mode === 'PRINT' ? 'pill-ember' : 'pill-muted'
                      }`}
                    >
                      Print Ready
                    </span>
                  </label>
                </div>
                <p className="text-xs text-ink/70 leading-relaxed">
                  Generates high-contrast, formal academic question sheets with writing rules and student roll number headers for in-person proctored testing.
                </p>
              </div>
            </div>
          </div>

          {/* ── ONLINE MODE: HUMAN-CENTRIC STUDENT MULTI-SELECT ── */}
          {mode === 'ONLINE' && (
            <div className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-6 animate-card-enter">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
                <div>
                  <h3 className="font-heading font-bold text-lg text-ink">
                    Assign Examination Audience *
                  </h3>
                  <p className="text-xs text-ink/60">
                    Assign paper directly to a classroom division or select individual candidates
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="pill pill-grape text-xs font-semibold">
                    {selectedStudentIds.length} Candidate{selectedStudentIds.length === 1 ? '' : 's'} Selected
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
                  <span>Assign by Class Section</span>
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
                  <span>Custom Student Selection</span>
                </button>
              </div>

              {/* Strategy 1: Assign to Whole Class */}
              {assignmentType === 'class' && (
                <div className="space-y-3">
                  <span className="font-mono text-[11px] font-semibold text-ink/60 uppercase tracking-wider block">
                    Select Target Division (One-Click Bulk Assignment)
                  </span>

                  {classes.length === 0 ? (
                    <div className="p-6 text-center text-xs text-ink/50 bg-bg rounded-card border border-dashed border-border">
                      No classes configured yet. Please configure classes in the School Admin dashboard or switch to Custom Selection.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {classes.map((cls) => {
                        const isSelected = selectedClassId === cls.id;
                        return (
                          <div
                            key={cls.id}
                            onClick={() => handleClassSelect(cls.id)}
                            className={`p-4 rounded-card border-2 transition-all cursor-pointer space-y-2 ${
                              isSelected
                                ? 'border-forest bg-forest/10 shadow-sm scale-101'
                                : 'border-border bg-bg hover:bg-surface-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-heading font-bold text-lg text-ink">
                                Class {cls.name}
                              </span>
                              {isSelected ? (
                                <span className="pill pill-forest text-[10px]">Active Target</span>
                              ) : (
                                <span className="font-mono text-[10px] text-ink/50">Std {cls.standard}</span>
                              )}
                            </div>

                            <div className="text-xs text-ink/70">
                              <span className="font-semibold text-forest">{cls.student_count}</span> enrolled of{' '}
                              <span className="font-mono">{cls.max_students}</span> max capacity
                            </div>

                            {cls.class_teacher_name && (
                              <div className="text-[11px] text-ink/60 pt-1 border-t border-border/60">
                                👨‍🏫 Class Teacher: <span className="font-semibold">{cls.class_teacher_name}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Strategy 2: Individual Candidates List & Filter */}
              {assignmentType === 'individual' && (
                <div className="space-y-3">
                  {/* Search and Class Filter Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Search students by name, email or username..."
                        disabled={isSubmitting}
                        className="w-full rounded-card border border-border bg-bg px-4 py-2 text-xs text-ink placeholder:text-ink/40 focus:bg-surface focus:border-grape focus:outline-none"
                      />
                    </div>

                    <div>
                      <CustomSelect
                        value={classFilter}
                        onChange={(val) => setClassFilter(val)}
                        options={[
                          { value: 'ALL', label: 'All Classes & Divisions' },
                          ...classes.map((c) => ({
                            value: String(c.id),
                            label: `Class ${c.name}`,
                          })),
                          { value: 'UNASSIGNED', label: 'Unassigned Candidates' },
                        ]}
                        placeholder="Filter by class/division..."
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-ink/60 pt-1">
                    <span>Showing {filteredStudents.length} candidates</span>
                    {filteredStudents.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAllStudents}
                        className="font-heading font-semibold text-forest hover:underline cursor-pointer"
                      >
                        {selectedStudentIds.length === filteredStudents.length
                          ? 'Deselect All Filtered'
                          : 'Select All Filtered'}
                      </button>
                    )}
                  </div>

                  {/* Student Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
                    {filteredStudents.map((s) => {
                      const isSelected = selectedStudentIds.includes(s.id);
                      const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
                      const initials = (
                        (s.first_name?.[0] || '') + (s.last_name?.[0] || s.username[0] || '?')
                      ).toUpperCase();

                      return (
                        <div
                          key={s.id}
                          onClick={() => handleStudentToggle(s.id)}
                          className={`p-3 rounded-card border transition-all cursor-pointer flex items-center gap-3 ${
                            isSelected
                              ? 'border-grape bg-grape/10 shadow-sm'
                              : 'border-border bg-bg hover:bg-surface-muted'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggle(s.id)}
                            disabled={isSubmitting}
                            className="sr-only"
                          />

                          {/* Avatar initials badge */}
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-heading font-bold text-xs shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-grape text-white'
                                : 'bg-surface border border-border text-ink/70'
                            }`}
                          >
                            {initials}
                          </div>

                          <div className="flex-1 min-w-0 text-xs">
                            <div className="font-heading font-semibold text-ink truncate">
                              {fullName || s.username}
                            </div>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              {s.class_section_name ? (
                                <span className="pill text-[9px] bg-forest/15 text-forest border border-forest/20 font-semibold py-0.5">
                                  Class {s.class_section_name}
                                </span>
                              ) : (
                                <span className="text-[10px] text-ink/40 font-mono">Unassigned</span>
                              )}
                            </div>
                          </div>

                          {isSelected && (
                            <span className="pill pill-grape text-[10px] py-0.5 px-1.5 shrink-0">
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Scheduling Window ── */}
              <div className="pt-4 border-t border-border space-y-3">
                <div className="font-heading font-semibold text-xs text-ink uppercase tracking-wider">
                  Test Availability Window (Optional)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label
                      htmlFor="avail-from"
                      className="block text-[11px] font-mono text-ink/60"
                    >
                      Available From
                    </label>
                    <input
                      id="avail-from"
                      type="datetime-local"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="avail-until"
                      className="block text-[11px] font-mono text-ink/60"
                    >
                      Available Until
                    </label>
                    <input
                      id="avail-until"
                      type="datetime-local"
                      value={availableUntil}
                      onChange={(e) => setAvailableUntil(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PRINT MODE EXPLANATION CARD ── */}
          {mode === 'PRINT' && (
            <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-3">
              <div className="flex items-center gap-2">
                <span className="pill pill-ember text-xs">Print Delivery</span>
              </div>
              <h3 className="font-heading font-bold text-base text-ink">
                Ready for High-Contrast Institutional Printing
              </h3>
              <p className="text-xs text-ink/70 leading-relaxed max-w-xl">
                Creating a Print Delivery logs an official proctored test session in your academic records. You will immediately be routed to the clean, formal print layout view.
              </p>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex items-center justify-between pt-2">
            <Link
              to={`/papers/${paperId}/versions/${vId}`}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              id="submit-delivery-btn"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <span>{isSubmitting ? 'Creating Test Delivery...' : 'Confirm & Deploy Test'}</span>
              <span>→</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export const DeliveryPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <DeliveryPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <DeliveryPageTablet key="tablet" />;
  }
  return <DeliveryPageDesktop key="desktop" />;
};

