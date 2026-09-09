import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import type { Paper, User, Delivery } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal, canEditUser } from '../../../components/users/UpdateUserModal';
import {
  FilePlus,
  Sparkles,
  ChevronRight,
  Clock,
  Plus,
  Edit2,
  Users,
} from 'lucide-react';
import {
  SkeletonPaperGrid,
  SkeletonDeliveriesList,
  SkeletonCompactList,
} from '../../../components/ui/skeleton';

export const TeacherDashboardMobile: React.FC = () => {
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
  }, [fetchStudents]);

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

      {(papersError || deliveriesError) && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {papersError || deliveriesError}
        </div>
      )}

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

      {/* ── Question Papers Feed (Most Important Content First) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-ink/60 px-1 font-mono">
          <span>CURRICULUM PAPERS ({papers.length})</span>
          <span className="text-[11px]">Tap to configure</span>
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
              <Link
                key={p.id}
                to={`/papers/${p.id}`}
                style={getStaggerDelay(idx, true)}
                className={`animate-card-enter block p-4 rounded-card bg-surface border border-border shadow-xs space-y-2.5 ${MOTION.touch.card.className}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="font-heading font-bold text-sm text-ink leading-snug">
                      {p.title}
                    </h3>
                    <div className="text-[11px] text-ink/60 font-mono">
                      Chapter: {p.chapter_title || `#${p.chapter}`}
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

                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
                  <span className="font-mono text-ink/50">
                    {p.versions?.length || 1} Version{(p.versions?.length || 1) === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-1 text-forest font-heading font-semibold text-xs">
                    <span>Manage</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </Link>
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
    </div>
  );
};
