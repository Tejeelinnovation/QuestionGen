import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import type { Paper, User, Delivery } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { canEditUser } from '../../../utils/userPermissions';
import {
  FilePlus,
  Sparkles,
  ChevronRight,
  Clock,
  Plus,
  Edit2,
  Users,
  Trash2,
  Lock,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  SkeletonPaperGrid,
  SkeletonDeliveriesList,
  SkeletonCompactList,
} from '../../../components/ui/skeleton';
import { TeacherClassesSection } from '../../../components/teachers/TeacherClassesSection';
import { useToast } from '../../../context/ToastContext';

export const TeacherDashboardMobile: React.FC = () => {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState<boolean>(true);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);

  const [studentsError, setStudentsError] = useState<string | null>(null);

  // Paper deletion states
  const [paperToDelete, setPaperToDelete] = useState<Paper | null>(null);
  const [isDeletingPaper, setIsDeletingPaper] = useState<boolean>(false);
  const [deletePaperError, setDeletePaperError] = useState<string | null>(null);

  // Modal / Drawer state
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  const fetchStudents = useCallback(async () => {
    setIsLoadingStudents(true);
    setStudentsError(null);
    try {
      const data = await usersApi.getAllUsers({ role: 'Student' });
      setStudents(data);
    } catch (err: any) {
      console.error('Failed to load students:', err);
      setStudentsError(err.response?.data?.detail || 'Failed to load students.');
    } finally {
      setIsLoadingStudents(false);
    }
  }, []);

  useEffect(() => {
    const fetchPapers = async () => {
      setIsLoadingPapers(true);
      try {
        const data = await papersApi.getPapers();
        setPapers(data);
      } catch (err: any) {
        console.error('Failed to load papers:', err);
      } finally {
        setIsLoadingPapers(false);
      }
    };

    const fetchDeliveries = async () => {
      setIsLoadingDeliveries(true);
      try {
        const data = await papersApi.getDeliveries();
        setDeliveries(data);
      } catch (err: any) {
        console.error('Failed to load deliveries:', err);
      } finally {
        setIsLoadingDeliveries(false);
      }
    };

    fetchPapers();
    fetchDeliveries();
    fetchStudents();
  }, [fetchStudents]);

  const handleDeletePaper = async () => {
    if (!paperToDelete) return;
    setIsDeletingPaper(true);
    setDeletePaperError(null);
    try {
      await papersApi.deletePaper(paperToDelete.id);
      setPapers((prev) => prev.filter((p) => p.id !== paperToDelete.id));
      toast.success(`Paper "${paperToDelete.title}" was deleted successfully.`);
      setPaperToDelete(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to delete paper. Please try again.';
      setDeletePaperError(msg);
      toast.error(msg);
    } finally {
      setIsDeletingPaper(false);
    }
  };

  return (
    <div className="space-y-5 font-body">
      {/* ── Top Header ── */}
      <div className="space-y-1.5 border-b border-border pb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-[11px] font-semibold text-forest">
          <Sparkles className="w-3 h-3 text-forest" />
          Academic Examination Studio
        </div>
        <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
          Teacher Studio
        </h1>
        <p className="text-xs text-ink/70">
          Design curriculum papers, configure Bloom's taxonomy, and review submissions.
        </p>
      </div>

      {/* ── Single Prominent Condensed Headline Stat Block ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-4xl text-forest tracking-tight">
              {papers.length}
            </span>
            <span className="font-heading font-semibold text-sm text-ink/80">
              Question Papers Created
            </span>
          </div>
          <span className="pill pill-grape text-xs">
            {deliveries.length} Deliveries
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-ink/70">
          <span>{students.length} Students in Cohort</span>
          <span className="font-mono text-[11px] text-forest font-semibold">
            {papers.filter((p) => p.status === 'FINALIZED').length} Finalized
          </span>
        </div>
      </div>

      {/* ── Primary Action: + Create New Paper ── */}
      <Link
        to="/papers/new"
        id="mobile-create-paper-btn"
        className="w-full py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-sm hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
      >
        <FilePlus className="w-4 h-4" />
        <span>Create New Paper</span>
      </Link>

      {/* ── Academic Classes & Teaching Scope (Grape Block) ── */}
      <TeacherClassesSection compact={true} />

      {/* ── Question Papers Feed (Most Important Content First) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>CURRICULUM PAPERS ({papers.length})</span>
          <span className="text-[11px]">Blueprints & Question Banks</span>
        </div>



        {isLoadingPapers ? (
          <SkeletonPaperGrid count={2} />
        ) : papers.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink/60 bg-surface border border-border rounded-card space-y-2">
            <p>No question papers created yet.</p>
            <Link
              to="/papers/new"
              className="inline-flex items-center text-xs font-heading font-semibold text-forest hover:underline"
            >
              Start your first paper →
            </Link>
          </div>
        ) : (
          papers.map((p, idx) => {
            const isFinal = p.status === 'FINALIZED';
            return (
              <div
                key={p.id}
                style={getStaggerDelay(idx, true)}
                className={`animate-card-enter p-4 rounded-card bg-surface border border-border shadow-xs space-y-3 ${MOTION.touch.card.className}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-ink/50">Paper #{p.id}</span>
                      {p.duration_minutes ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-50 text-amber-700 border border-amber-200">
                          ⏱ {p.duration_minutes}m
                        </span>
                      ) : null}
                    </div>
                    <h3 className="font-heading font-bold text-sm text-ink leading-snug">
                      <Link to={`/papers/${p.id}`} className="hover:text-forest transition-colors">
                        {p.title}
                      </Link>
                    </h3>
                    <div className="text-[11px] text-ink/60 font-medium flex items-center gap-1.5 flex-wrap">
                      {p.subjects && p.subjects.length > 0 ? (
                        <span>{p.subjects.join(', ')}</span>
                      ) : (
                        <span>{p.chapter_title || (p.chapter ? `Chapter #${p.chapter}` : 'General')}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`pill text-[10px] py-0.5 px-2 shrink-0 ${
                      isFinal ? 'pill-forest' : 'pill-muted'
                    }`}
                  >
                    {isFinal ? 'Finalized' : 'Draft'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-border/50 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-ink/50">
                      {p.version_count ?? (p.versions?.length || 1)} Version{(p.version_count ?? (p.versions?.length || 1)) === 1 ? '' : 's'}
                    </span>
                    <span className="text-ink/30">•</span>
                    <span className="font-mono text-[10px] text-ink/40">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      id={`mobile-delete-paper-${p.id}`}
                      onClick={() => {
                        setDeletePaperError(null);
                        setPaperToDelete(p);
                      }}
                      title={p.is_assigned ? 'Cannot delete: Paper has active deliveries' : 'Delete paper'}
                      className={`p-2 min-h-[36px] min-w-[36px] rounded-pill border transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                        p.is_assigned
                          ? 'border-border/60 bg-surface-muted/60 text-ink/40'
                          : 'border-rose-200/80 bg-rose-50/40 text-rose-600 hover:bg-rose-100 hover:border-rose-300'
                      }`}
                    >
                      {p.is_assigned ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                    <Link
                      to={`/papers/${p.id}`}
                      className="px-3 py-1.5 rounded-pill bg-surface-muted border border-border text-[11px] font-heading font-semibold text-forest hover:bg-forest hover:text-white transition-colors min-h-[36px] flex items-center gap-1 active:scale-95 cursor-pointer"
                    >
                      <span>Studio</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Active Test Deliveries Feed ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>SCHEDULED DELIVERIES ({deliveries.length})</span>
        </div>

        {isLoadingDeliveries ? (
          <SkeletonDeliveriesList count={2} />
        ) : deliveries.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No active test deliveries. Finalize a paper to schedule one.
          </div>
        ) : (
          deliveries.map((d, idx) => (
            <div
              key={d.id}
              style={getStaggerDelay(idx, true)}
              className={`animate-card-enter p-3.5 rounded-card bg-surface border border-border shadow-xs space-y-2 ${MOTION.touch.card.className}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="font-heading font-bold text-xs text-ink">
                    Delivery #{d.id} • {d.paper_title || 'Assessment'}
                  </span>
                  <div className="text-[11px] text-ink/60 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-ink/40" />
                    <span>Mode: {d.mode}</span>
                  </div>
                </div>
                <Link
                  to={`/deliveries/${d.id}/results`}
                  className="px-2.5 py-1 rounded-pill bg-surface-muted border border-border text-[11px] font-heading font-semibold text-forest hover:bg-forest hover:text-white transition-colors"
                >
                  Results Roster →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Enrolled Students Section ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-grape" />
            <span>ENROLLED STUDENTS ({students.length})</span>
          </div>
          <button
            type="button"
            id="mobile-teacher-create-student-btn"
            onClick={() => setIsCreateStudentOpen(true)}
            className="px-2.5 py-1 rounded-pill bg-grape text-white text-[11px] font-heading font-semibold hover:bg-grape/90 transition-all flex items-center gap-1 cursor-pointer min-h-[36px]"
          >
            <Plus className="w-3 h-3" />
            <span>Student</span>
          </button>
        </div>

        {isLoadingStudents ? (
          <SkeletonCompactList count={3} />
        ) : studentsError ? (
          <div className="p-3 text-xs font-medium text-ember bg-ember/10 border border-ember/30 rounded-card">
            {studentsError}
          </div>
        ) : students.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/60 bg-surface border border-border rounded-card">
            No enrolled students in your classroom yet.
          </div>
        ) : (
          <div className="space-y-2">
            {students.map((s, idx) => {
              const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
              const canEdit = canEditUser(currentUser, s);

              return (
                <div
                  key={s.id}
                  style={getStaggerDelay(idx, true)}
                  className={`animate-card-enter p-3 rounded-card bg-surface border border-border shadow-xs flex items-center justify-between gap-2 ${MOTION.touch.card.className}`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-heading font-semibold text-xs text-ink truncate">
                      {fullName || s.username}
                    </div>
                    <div className="font-mono text-[11px] text-ink/50 truncate">
                      @{s.username} • #{s.id}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        id={`mobile-edit-student-${s.id}`}
                        onClick={() => setEditUserId(s.id)}
                        className="px-3 py-1.5 rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white text-[11px] font-heading font-semibold transition-all flex items-center gap-1 cursor-pointer min-h-[36px]"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals & Drawers */}
      <CreateUserDrawer
        isOpen={isCreateStudentOpen}
        targetProfile="student"
        onClose={() => setIsCreateStudentOpen(false)}
        onUserCreated={() => fetchStudents()}
      />

      <UpdateUserModal
        userId={editUserId}
        isOpen={editUserId !== null}
        onClose={() => setEditUserId(null)}
        onUserUpdated={() => fetchStudents()}
      />

      {/* ── Mobile Delete Confirmation / Academic Integrity Guard Modal ── */}
      {paperToDelete && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface rounded-card border border-border p-5 max-w-md w-full shadow-lg space-y-4 animate-scale-up">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {paperToDelete.is_assigned ? (
                  <div className="p-2 rounded-pill bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="p-2 rounded-pill bg-rose-50 border border-rose-200 text-rose-600 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-heading font-bold text-base text-ink">
                    {paperToDelete.is_assigned ? 'Paper Locked' : 'Delete Question Paper'}
                  </h3>
                  <p className="text-[11px] font-mono text-ink/50 truncate">
                    Paper #{paperToDelete.id} • {paperToDelete.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPaperToDelete(null);
                  setDeletePaperError(null);
                }}
                className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-pill hover:bg-surface-muted text-ink/50 hover:text-ink transition-colors cursor-pointer active:scale-95 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deletePaperError && (
              <div className="p-3 rounded-card bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{deletePaperError}</span>
              </div>
            )}

            {paperToDelete.is_assigned ? (
              <div className="space-y-3 text-xs text-ink/75 leading-relaxed">
                <p>
                  This paper is currently associated with{' '}
                  <strong className="text-ink">
                    {paperToDelete.delivery_count || 'active'} test delivery session(s)
                  </strong>{' '}
                  assigned to classes or cohorts.
                </p>
                <div className="p-3 rounded-card bg-amber-50 border border-amber-200 text-amber-800 space-y-1">
                  <span className="font-semibold block font-heading">Academic Integrity Guard:</span>
                  <span className="text-[11px] leading-normal block">
                    To preserve student test history, grading logs, and official performance records, question papers that have been delivered or assigned cannot be deleted.
                  </span>
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setPaperToDelete(null);
                      setDeletePaperError(null);
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors cursor-pointer min-h-[44px] active:scale-95"
                  >
                    Understood
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-ink/75 leading-relaxed">
                  Are you sure you want to permanently delete{' '}
                  <strong className="text-ink">"{paperToDelete.title}"</strong>? All drafted versions and syllabus blueprints associated with this paper will be permanently removed.
                </p>
                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isDeletingPaper}
                    onClick={() => {
                      setPaperToDelete(null);
                      setDeletePaperError(null);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-pill border border-border text-ink/70 font-heading font-semibold text-xs hover:text-ink hover:border-ink/40 transition-colors cursor-pointer disabled:opacity-50 min-h-[44px] active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingPaper}
                    onClick={handleDeletePaper}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-pill bg-rose-600 text-white font-heading font-semibold text-xs hover:bg-rose-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 min-h-[44px] active:scale-95"
                  >
                    {isDeletingPaper ? (
                      <span>Deleting...</span>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Paper</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
