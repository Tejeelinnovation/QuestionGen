import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import type { Delivery, PaperVersion, User } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { Send, Check, Search, CheckCircle2 } from 'lucide-react';

export const DeliveryPageMobile: React.FC = () => {
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

  const filteredStudents = students.filter((s) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return s.username.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
  });

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
      const payload: any = {
        mode,
        student_ids: selectedStudentIds,
      };
      if (availableFrom) payload.available_from = new Date(availableFrom).toISOString();
      if (availableUntil) payload.available_until = new Date(availableUntil).toISOString();

      const delivery = await papersApi.deliverVersion(paperId, vId, payload);
      setCreatedDelivery(delivery);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to schedule delivery.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-xs text-ink/60 font-body">
        Loading test delivery parameters...
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body">
      <PaperWorkflowNavMobile
        currentStep="deliver"
        paperId={paperId}
        paperTitle={version?.paper_title}
        backTo={`/papers/${paperId}/versions/${vId}`}
      />

      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-heading font-bold text-lg text-ink tracking-tight">
          Schedule Test Delivery
        </h1>
        <p className="text-xs text-ink/70">
          Assign Version {version?.version_label} to student cohorts and define test windows.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {createdDelivery ? (
        <div className="p-4 rounded-card bg-surface border border-forest/40 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-forest">
            <CheckCircle2 className="w-5 h-5" />
            <h2 className="font-heading font-bold text-sm">Delivery Scheduled!</h2>
          </div>
          <p className="text-xs text-ink/80 leading-relaxed">
            Test delivery #{createdDelivery.id} is active for {selectedStudentIds.length} assigned students.
          </p>
          <Link
            to={`/deliveries/${createdDelivery.id}/results`}
            className="w-full py-3 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 min-h-[48px]"
          >
            <span>View Results Roster →</span>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode Selection */}
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2">
            <label className="block text-xs font-heading font-semibold text-ink">
              Delivery Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('ONLINE')}
                className={`py-2.5 px-3 rounded-pill text-xs font-heading font-semibold transition-all min-h-[44px] cursor-pointer ${
                  mode === 'ONLINE'
                    ? 'bg-forest text-white shadow-xs'
                    : 'bg-surface-muted text-ink/70 border border-border'
                }`}
              >
                🌐 Online Assessment
              </button>
              <button
                type="button"
                onClick={() => setMode('PRINT')}
                className={`py-2.5 px-3 rounded-pill text-xs font-heading font-semibold transition-all min-h-[44px] cursor-pointer ${
                  mode === 'PRINT'
                    ? 'bg-ember text-white shadow-xs'
                    : 'bg-surface-muted text-ink/70 border border-border'
                }`}
              >
                🖨️ Physical Print
              </button>
            </div>
          </div>

          {/* Availability Time Windows */}
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3">
            <label className="block text-xs font-heading font-semibold text-ink">
              Assessment Time Window (Optional)
            </label>
            <div className="space-y-2 text-xs">
              <div className="space-y-1">
                <span className="text-ink/60">Available From:</span>
                <input
                  type="datetime-local"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:border-forest focus:outline-none min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <span className="text-ink/60">Available Until:</span>
                <input
                  type="datetime-local"
                  value={availableUntil}
                  onChange={(e) => setAvailableUntil(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-card bg-surface border border-border text-xs focus:border-forest focus:outline-none min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Student Assignment List */}
          {mode === 'ONLINE' && (
            <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-heading font-semibold text-ink">
                  Assign Students ({selectedStudentIds.length} chosen)
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllStudents}
                  className="text-xs font-heading font-semibold text-forest hover:underline cursor-pointer"
                >
                  {selectedStudentIds.length === filteredStudents.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students..."
                  className="w-full pl-8 pr-3 py-2 rounded-card bg-surface-muted border border-border text-xs focus:border-forest focus:outline-none min-h-[40px]"
                />
                <Search className="w-3.5 h-3.5 text-ink/40 absolute left-2.5 top-3" />
              </div>

              <div className="space-y-1.5 max-h-[35vh] overflow-y-auto pr-1">
                {filteredStudents.length === 0 ? (
                  <div className="p-3 text-center text-xs text-ink/50">
                    No matching students found.
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    const isSelected = selectedStudentIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleStudentToggle(s.id)}
                        className={`w-full p-2.5 rounded-card text-left flex items-center justify-between border transition-all active:scale-[0.99] cursor-pointer min-h-[44px] ${
                          isSelected
                            ? 'bg-forest/5 border-forest'
                            : 'bg-surface border-border hover:border-forest/40'
                        }`}
                      >
                        <span className="font-heading font-medium text-xs text-ink truncate">
                          {s.username} {s.email && `(${s.email})`}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center ${
                            isSelected
                              ? 'bg-forest border-forest text-white'
                              : 'border-border bg-surface'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            id="mobile-submit-delivery"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              'Scheduling Delivery...'
            ) : (
              <>
                <Send className="w-4 h-4 text-lime" />
                <span>Publish Test Delivery</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
