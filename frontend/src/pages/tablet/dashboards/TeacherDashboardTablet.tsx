import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import { useAuth } from '../../../auth/AuthContext';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { canEditUser } from '../../../utils/userPermissions';
import { Plus, Edit2 } from 'lucide-react';
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
                  <Link
                    to={`/papers/${p.id}`}
                    className="px-4 py-2 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors min-h-[40px] flex items-center"
                  >
                    Open Studio →
                  </Link>
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
    </div>
  );
};
