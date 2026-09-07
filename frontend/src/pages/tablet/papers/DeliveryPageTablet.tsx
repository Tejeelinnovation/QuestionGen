import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import type { Delivery, PaperVersion, User } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';

export const DeliveryPageTablet: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);

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

        const usersData = await usersApi.getUsers();
        const studentList = usersData.filter((u) => u.role_label === 'Student');
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

      {errorMessage && (
        <div
          id="delivery-error-banner"
          className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium"
        >
          {errorMessage}
        </div>
      )}

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

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/20">
            <Link
              to="/dashboard/teacher"
              className="px-5 py-2.5 rounded-pill bg-surface text-ink text-xs font-heading font-semibold hover:bg-bg min-h-[44px] flex items-center"
            >
              Teacher Studio
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
                      Assign Students *
                    </h3>
                    <p className="text-xs text-ink/60">
                      Tap student cardlets to select
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="pill pill-grape text-[10px]">
                      {selectedStudentIds.length} Selected
                    </span>
                    {filteredStudents.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAllStudents}
                        className="text-xs font-heading font-semibold text-forest hover:underline"
                      >
                        {selectedStudentIds.length === filteredStudents.length ? 'Deselect' : 'All'}
                      </button>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students..."
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-grape focus:outline-none min-h-[40px]"
                />

                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
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
                            <div className="font-mono text-[10px] text-ink/50 truncate">
                              @{s.username}
                            </div>
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
