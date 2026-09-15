import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import { useAuth } from '../../../auth/AuthContext';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { canEditUser } from '../../../utils/userPermissions';
import { Plus, Edit2, Trash2, Lock, AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { Paper, User, Delivery } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import {
  SkeletonPaperGrid,
  SkeletonDeliveriesList,
  SkeletonCompactList,
} from '../../../components/ui/skeleton';
import { TeacherClassesSection } from '../../../components/teachers/TeacherClassesSection';

export const TeacherDashboardTablet: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState<boolean>(true);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // Paper deletion state & modal
  const [paperToDelete, setPaperToDelete] = useState<Paper | null>(null);
  const [isDeletingPaper, setIsDeletingPaper] = useState(false);
  const [deletePaperError, setDeletePaperError] = useState<string | null>(null);
  const [deletePaperSuccess, setDeletePaperSuccess] = useState<string | null>(null);

  // Modals state
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  const fetchStudents = async () => {
    setIsLoadingStudents(true);
    setStudentsError(null);
    try {
      const data = await usersApi.getAllUsers({ role: 'Student' });
      setStudents(data);
    } catch (err: any) {
      setStudentsError(err.response?.data?.detail || 'Failed to load students.');
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    const fetchPapers = async () => {
      setIsLoadingPapers(true);
      setPapersError(null);
      try {
        const data = await papersApi.getPapers();
        setPapers(data);
      } catch (err: any) {
        setPapersError(err.response?.data?.detail || 'Failed to load question papers.');
      } finally {
        setIsLoadingPapers(false);
      }
    };

    const fetchDeliveries = async () => {
      setIsLoadingDeliveries(true);
      setDeliveriesError(null);
      try {
        const data = await papersApi.getDeliveries();
        setDeliveries(data);
      } catch (err: any) {
        setDeliveriesError(err.response?.data?.detail || 'Failed to load deliveries.');
      } finally {
        setIsLoadingDeliveries(false);
      }
    };

    fetchPapers();
    fetchDeliveries();
    fetchStudents();
  }, []);

  const handleDeletePaper = async () => {
    if (!paperToDelete) return;
    setIsDeletingPaper(true);
    setDeletePaperError(null);
    try {
      await papersApi.deletePaper(paperToDelete.id);
      setPapers((prev) => prev.filter((p) => p.id !== paperToDelete.id));
      setDeletePaperSuccess(`Paper "${paperToDelete.title}" was deleted successfully.`);
      setPaperToDelete(null);
      setTimeout(() => setDeletePaperSuccess(null), 4000);
    } catch (err: any) {
      setDeletePaperError(
        err.response?.data?.detail || 'Failed to delete paper. Please try again.'
      );
    } finally {
      setIsDeletingPaper(false);
    }
  };

  return (
    <div className="space-y-8 font-body">
      {/* ── Top Header ── */}
      <div className="border-b border-border pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Teacher Examination Studio • Tablet
          </div>
          <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
            Academic Studio
          </h1>
          <p className="text-sm text-ink/75 max-w-xl leading-relaxed">
            Managing{' '}
            <span className="font-heading font-bold text-forest underline decoration-forest/40">
              {papers.length} question papers
            </span>{' '}
            and{' '}
            <span className="font-heading font-bold text-ember underline decoration-ember/40">
              {deliveries.length} test deliveries
            </span>{' '}
            for {students.length} enrolled students.
          </p>
        </div>

        <Link
          to="/papers/new"
          id="create-test-btn"
          className="px-5 py-3 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-sm cursor-pointer min-h-[44px] flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <span>+ Create New Paper</span>
        </Link>
      </div>

      {/* ── Section 0: Academic Classes & Teaching Scope (Grape Block) ── */}
      <TeacherClassesSection compact={true} />

      {/* ── Section 1: Authored Question Papers (2-Column Bento Grid) ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-l-4 border-forest pl-3">
          <div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Authored Question Papers
            </h2>
            <p className="text-xs text-ink/65">
              Draft blueprints & syllabus question banks
            </p>
          </div>
          <span className="pill pill-forest text-xs">
            {papers.length} Papers
          </span>
        </div>

        {deletePaperSuccess && (
          <div className="p-3 rounded-card bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{deletePaperSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setDeletePaperSuccess(null)}
              className="text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer p-1"
            >
              ✕
            </button>
          </div>
        )}

        {isLoadingPapers && (
          <SkeletonPaperGrid count={2} />
        )}

        {papersError && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
            {papersError}
          </div>
        )}

        {!isLoadingPapers && !papersError && papers.length === 0 && (
          <div className="bg-surface border-2 border-dashed border-border rounded-card p-8 text-center space-y-3">
            <span className="pill pill-forest text-xs">Repository Ready</span>
            <h3 className="font-heading font-bold text-base text-ink">No Question Papers Created Yet</h3>
            <Link
              to="/papers/new"
              className="inline-block px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90"
            >
              Start First Paper →
            </Link>
          </div>
        )}

        {!isLoadingPapers && !papersError && papers.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {papers.map((p, idx) => (
              <div
                key={p.id}
                style={getStaggerDelay(idx)}
                className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card flex flex-col justify-between space-y-4 ${MOTION.touch.card.className}`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink/50">Paper #{p.id}</span>
                    <div className="flex items-center gap-1.5">
                      {p.duration_minutes ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200">
                          ⏱ {p.duration_minutes}m
                        </span>
                      ) : null}
                      <span className="pill pill-muted text-[10px]">
                        {p.version_count ?? 0} {p.version_count === 1 ? 'Version' : 'Versions'}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-heading font-bold text-lg text-ink line-clamp-2">
                    <Link to={`/papers/${p.id}`} className="hover:text-forest transition-colors">
                      {p.title}
                    </Link>
                  </h3>

                  <div className="text-xs text-ink/70 flex items-center gap-1.5 font-medium flex-wrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-forest shrink-0" />
                    {p.subjects && p.subjects.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.subjects.map((sub, sidx) => (
                          <span key={sidx} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {sub}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>{p.chapter_title || (p.chapter ? `Chapter #${p.chapter}` : 'General Curriculum')}</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-ink/50">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeletePaperError(null);
                        setPaperToDelete(p);
                      }}
                      title={p.is_assigned ? 'Cannot delete: Paper has active deliveries' : 'Delete paper'}
                      className={`p-2 rounded-pill border transition-colors flex items-center gap-1 text-xs cursor-pointer ${
                        p.is_assigned
                          ? 'border-border/60 bg-surface-muted/60 text-ink/40'
                          : 'border-rose-200/80 bg-rose-50/40 text-rose-600 hover:bg-rose-100 hover:border-rose-300'
                      }`}
                    >
                      {p.is_assigned ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                    <Link
                      to={`/papers/${p.id}`}
                      className="px-4 py-2 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors min-h-[40px] flex items-center"
                    >
                      Open Studio →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: 2-Column Bento Reflow for Deliveries & Students ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Column 1: Test Deliveries & Results */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-ember pl-3">
            <div>
              <h2 className="font-heading font-bold text-lg text-ink">
                Test Deliveries
              </h2>
              <p className="text-xs text-ink/65">
                Active test sessions & rosters
              </p>
            </div>
            <span className="pill pill-ember text-xs">
              {deliveries.length}
            </span>
          </div>

          {isLoadingDeliveries && (
            <SkeletonDeliveriesList count={2} />
          )}

          {deliveriesError && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
              {deliveriesError}
            </div>
          )}

          {!isLoadingDeliveries && !deliveriesError && (
            <div className="space-y-3">
              {deliveries.map((d, idx) => (
                <div
                  key={d.id}
                  style={getStaggerDelay(idx)}
                  className={`animate-card-enter bg-surface border border-border rounded-card p-4 shadow-card space-y-3 ${MOTION.touch.card.className}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink">
                        #{d.id}
                      </span>
                      <span
                        className={`pill text-[10px] ${
                          d.mode === 'ONLINE' ? 'pill-lime' : 'pill-muted'
                        }`}
                      >
                        {d.mode}
                      </span>
                      <span className="pill pill-muted text-[10px]">
                        Ver. {d.version_label}
                      </span>
                    </div>

                    <h4 className="font-heading font-semibold text-sm text-ink truncate">
                      {d.paper_title || 'Question Paper'}
                    </h4>

                    <div className="text-[11px] text-ink/60 font-mono">
                      {d.assigned_students?.length || 0} candidates assigned
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-end">
                    {d.mode === 'ONLINE' ? (
                      <Link
                        to={`/deliveries/${d.id}/results`}
                        className="px-4 py-2 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 transition-colors min-h-[40px] flex items-center"
                      >
                        Results Roster →
                      </Link>
                    ) : (
                      <span className="text-xs text-ink/50 italic py-1">
                        Print Ready
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {deliveries.length === 0 && (
                <div className="bg-surface border border-border rounded-card p-6 text-center text-xs text-ink/60">
                  No active test deliveries.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Column 2: Enrolled Students Roster */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-grape pl-3">
            <div>
              <h2 className="font-heading font-bold text-lg text-ink">
                Enrolled Students
              </h2>
              <p className="text-xs text-ink/65">
                Students in your teaching scope
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="tablet-teacher-create-student-btn"
                onClick={() => setIsCreateStudentOpen(true)}
                className="px-2.5 py-1 rounded-pill bg-grape text-white text-xs font-heading font-semibold hover:bg-grape/90 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Student</span>
              </button>
              <span className="pill pill-grape text-xs">
                {students.length}
              </span>
            </div>
          </div>

          {isLoadingStudents && (
            <SkeletonCompactList count={4} />
          )}

          {studentsError && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
              {studentsError}
            </div>
          )}

          {!isLoadingStudents && !studentsError && (
            <div className="bg-surface border border-border rounded-card p-4 shadow-card">
              {students.length === 0 ? (
                <div className="text-center py-6 text-xs text-ink/50 italic">
                  No enrolled students mapped to your classroom.
                </div>
              ) : (
                <div className="divide-y divide-border/60 max-h-[400px] overflow-y-auto pr-1">
                  {students.map((s) => {
                    const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
                    const canEdit = canEditUser(currentUser, s);

                    return (
                      <div key={s.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0 pr-2">
                          <div className="font-heading font-semibold text-ink truncate">
                            {fullName || s.username}
                          </div>
                          <div className="font-mono text-[11px] text-ink/50 truncate">
                            @{s.username}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canEdit && (
                            <button
                              type="button"
                              id={`tablet-edit-student-${s.id}`}
                              onClick={() => setEditUserId(s.id)}
                              className="px-2 py-0.5 rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white text-[11px] font-heading font-semibold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                          <span className="font-mono text-[10px] text-ink/50 bg-bg px-2 py-0.5 rounded border border-border">
                            #{s.id}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
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

      {/* Delete Paper Modal with Assignment Validation */}
      {paperToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-6 shadow-modal space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    paperToDelete.is_assigned ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {paperToDelete.is_assigned ? <Lock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-ink">
                    {paperToDelete.is_assigned ? 'Cannot Delete Assigned Paper' : 'Delete Question Paper'}
                  </h3>
                  <span className="font-mono text-xs text-ink/50">Paper #{paperToDelete.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPaperToDelete(null);
                  setDeletePaperError(null);
                }}
                className="text-ink/40 hover:text-ink p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deletePaperError && (
              <div className="p-3 rounded-card bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{deletePaperError}</span>
              </div>
            )}

            {paperToDelete.is_assigned ? (
              <div className="space-y-3 text-xs text-ink/75 leading-relaxed">
                <p>
                  This paper is currently associated with{' '}
                  <strong className="text-ink">
                    {paperToDelete.delivery_count || 'active'} delivery session(s)
                  </strong>{' '}
                  assigned to classes or students.
                </p>
                <div className="p-3 rounded-card bg-amber-50 border border-amber-200 text-amber-800 space-y-1">
                  <span className="font-semibold block">Academic Integrity Guard:</span>
                  <span>
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
                    className="px-4 py-2 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors cursor-pointer"
                  >
                    Understood
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-ink/75 leading-relaxed">
                  Are you sure you want to permanently delete{' '}
                  <strong className="text-ink">"{paperToDelete.title}"</strong>? All drafted versions and syllabus blueprints associated with this paper will be removed.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isDeletingPaper}
                    onClick={() => {
                      setPaperToDelete(null);
                      setDeletePaperError(null);
                    }}
                    className="px-4 py-2 rounded-pill border border-border text-ink/70 font-heading font-semibold text-xs hover:text-ink hover:border-ink/40 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingPaper}
                    onClick={handleDeletePaper}
                    className="px-4 py-2 rounded-pill bg-rose-600 text-white font-heading font-semibold text-xs hover:bg-rose-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
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
