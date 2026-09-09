import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { usersApi } from '../../api/users';
import type { Delivery, PaperVersion, User } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useAuth } from '../../auth/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { DeliveryPageTablet } from '../tablet/papers/DeliveryPageTablet';
import { DeliveryPageMobile } from '../mobile/papers/DeliveryPageMobile';

const DeliveryPageDesktop: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const { dashboardPath } = useAuth();

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [mode, setMode] = useState<'ONLINE' | 'PRINT'>('ONLINE');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdDelivery, setCreatedDelivery] = useState<Delivery | null>(null);

  useEffect(() => {
    const loadVersionAndStudents = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const vData = await papersApi.getPaperVersion(paperId, vId);
        setVersion(vData);

        const studentList = await usersApi.getAllUsers({ role: 'Student' });
        setStudents(studentList);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load paper version or students list.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId && vId) {
      loadVersionAndStudents();
    }
  }, [paperId, vId]);

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
    setErrorMessage(null);

    if (mode === 'ONLINE' && selectedStudentIds.length === 0) {
      setErrorMessage('Please assign at least one student for online test delivery.');
      return;
    }

    setIsSubmitting(true);
    try {
      const deliveryPayload: any = {
        mode,
      };

      if (mode === 'ONLINE') {
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
    } catch (err: any) {
      const detail =
        err.response?.data?.student_ids?.[0] ||
        err.response?.data?.available_until?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to create test delivery.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStudents = students.filter((s) => {
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

      {errorMessage && (
        <div
          id="delivery-error-banner"
          className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium flex items-start gap-2"
        >
          <span className="font-bold text-sm">!</span>
          <span>{errorMessage}</span>
        </div>
      )}

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
                    Assign Enrolled Candidates *
                  </h3>
                  <p className="text-xs text-ink/60">
                    Pick students who are authorized to sit this exam session
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="pill pill-grape text-xs">
                    {selectedStudentIds.length} Candidate{selectedStudentIds.length === 1 ? '' : 's'} Selected
                  </span>
                  {filteredStudents.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllStudents}
                      className="text-xs font-heading font-semibold text-forest hover:underline cursor-pointer"
                    >
                      {selectedStudentIds.length === filteredStudents.length
                        ? 'Deselect All'
                        : 'Select All Filtered'}
                    </button>
                  )}
                </div>
              </div>

              {/* Search bar */}
              <div>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students by name or username..."
                  disabled={isSubmitting}
                  className="w-full rounded-card border border-border bg-bg px-4 py-2 text-xs text-ink placeholder:text-ink/40 focus:bg-surface focus:border-grape focus:outline-none"
                />
              </div>

              {/* Student Cards Grid (Feels like picking real people, not generic multi-select) */}
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
                        <div className="font-mono text-[10px] text-ink/50 truncate">
                          @{s.username}
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

                {filteredStudents.length === 0 && (
                  <div className="col-span-full py-8 text-center text-xs text-ink/50 italic">
                    No enrolled students matched your search query.
                  </div>
                )}
              </div>

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

