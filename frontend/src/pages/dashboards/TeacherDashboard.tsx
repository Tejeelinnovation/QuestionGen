import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { usersApi } from '../../api/users';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { TeacherDashboardTablet } from '../tablet/dashboards/TeacherDashboardTablet';
import { TeacherDashboardMobile } from '../mobile/dashboards/TeacherDashboardMobile';
import { useAuth } from '../../auth/AuthContext';
import { CreateUserDrawer } from '../../components/users/CreateUserDrawer';
import { UpdateUserModal, canEditUser } from '../../components/users/UpdateUserModal';
import { getStaggerDelay, MOTION } from '../../lib/motion';
import { Plus, Edit2 } from 'lucide-react';
import type { Paper, User, Delivery } from '../../types';

const TeacherDashboardDesktop: React.FC = () => {
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

  // Student create / edit modal states
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  const fetchStudents = async () => {
    setIsLoadingStudents(true);
    setStudentsError(null);
    try {
      const data = await usersApi.getUsers();
      setStudents(data.filter((u) => u.role_label === 'Student'));
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
    <div className="space-y-10">
      {/* ── Top Typographic Headline & Primary Action ── */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Teacher Examination Workspace
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Academic Studio
          </h1>
          <p className="font-body text-ink/75 text-base max-w-2xl leading-relaxed">
            Directing{' '}
            <span className="font-heading font-bold text-forest text-lg underline decoration-forest/40 underline-offset-2">
              {papers.length} question papers
            </span>{' '}
            and{' '}
            <span className="font-heading font-bold text-ember text-lg underline decoration-ember/40 underline-offset-2">
              {deliveries.length} test deliveries
            </span>{' '}
            for{' '}
            <span className="font-heading font-bold text-grape text-lg underline decoration-grape/40 underline-offset-2">
              {students.length} enrolled students
            </span>.
          </p>
        </div>

        <Link
          to="/papers/new"
          id="create-test-btn"
          className="self-start md:self-auto px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 shadow-sm transition-all cursor-pointer flex items-center gap-2"
        >
          <span>+ Create New Paper</span>
        </Link>
      </div>

      {/* ── Category Separation Architecture (Ref: 01 Color Blocked Functional Sections) ── */}

      {/* Category 1: Question Papers (Forest Color Block) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-l-4 border-forest pl-3">
          <div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Authored Question Papers
            </h2>
            <p className="text-xs text-ink/65">
              Drafted curriculum papers, syllabus blueprints & generated versions
            </p>
          </div>
          <span className="pill pill-forest text-xs">
            {papers.length} Papers in Archive
          </span>
        </div>

        {isLoadingPapers && (
          <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60">
            Loading papers repository...
          </div>
        )}

        {papersError && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
            {papersError}
          </div>
        )}

        {!isLoadingPapers && !papersError && papers.length === 0 && (
          <div className="bg-surface border-2 border-dashed border-border rounded-lg p-10 text-center space-y-3">
            <span className="pill pill-forest text-xs">Repository Ready</span>
            <h3 className="font-heading font-bold text-lg text-ink">No Question Papers Created Yet</h3>
            <p className="text-xs text-ink/70 max-w-sm mx-auto">
              Synthesize your first exam using Bloom’s taxonomy balancing and textbook syllabus mapping.
            </p>
            <Link
              to="/papers/new"
              className="inline-block mt-2 px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90"
            >
              Start First Paper
            </Link>
          </div>
        )}

        {!isLoadingPapers && !papersError && papers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {papers.map((p, idx) => {
              return (
                <div
                  key={p.id}
                  style={getStaggerDelay(idx)}
                  className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card hover:border-forest flex flex-col justify-between ${MOTION.hoverLift.className} ${MOTION.touch.card.className}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-ink/50">
                        Paper #{p.id}
                      </span>
                      <span className="pill pill-muted text-[10px]">
                        {p.version_count ?? 0} {p.version_count === 1 ? 'Version' : 'Versions'}
                      </span>
                    </div>

                    <h3 className="font-heading font-bold text-lg text-ink line-clamp-2">
                      <Link to={`/papers/${p.id}`} className="hover:text-forest transition-colors">
                        {p.title}
                      </Link>
                    </h3>

                    <div className="text-xs text-ink/70 flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-forest" />
                      <span>{p.chapter_title || `Chapter #${p.chapter}`}</span>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border/70 flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-ink/50">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                    <Link
                      to={`/papers/${p.id}`}
                      className="px-3 py-1.5 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors"
                    >
                      Open Studio →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Category 2 & 3: Asymmetric Split for Deliveries (Ember) and Enrolled Students (Grape) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Category 2: Deliveries & Assessment (Ember Block - 7 cols) */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-l-4 border-ember pl-3">
            <div>
              <h2 className="font-heading font-bold text-xl text-ink">
                Test Deliveries & Results
              </h2>
              <p className="text-xs text-ink/65">
                Active test instances, student delivery sessions & rosters
              </p>
            </div>
            <span className="pill pill-ember text-xs">
              {deliveries.length} Deliveries
            </span>
          </div>

          {isLoadingDeliveries && (
            <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60">
              Loading test deliveries...
            </div>
          )}

          {deliveriesError && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
              {deliveriesError}
            </div>
          )}

          {!isLoadingDeliveries && !deliveriesError && deliveries.length === 0 && (
            <div className="bg-surface border border-border rounded-lg p-6 text-center text-xs text-ink/60">
              No deliveries scheduled yet. Deliver a finalized paper version to view student performance.
            </div>
          )}

          {!isLoadingDeliveries && !deliveriesError && deliveries.length > 0 && (
            <div className="space-y-3">
              {deliveries.map((d, idx) => (
                <div
                  key={d.id}
                  style={getStaggerDelay(idx)}
                  className={`animate-card-enter bg-surface border border-border rounded-card p-4 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${MOTION.hoverLift.className} ${MOTION.touch.card.className}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink">
                        Delivery #{d.id}
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

                    <h4 className="font-heading font-semibold text-sm text-ink">
                      {d.paper_title || 'Question Paper'}
                    </h4>

                    <div className="text-[11px] text-ink/60 font-mono">
                      {d.assigned_students?.length || 0} candidates assigned • Scheduled {new Date(d.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div>
                    {d.mode === 'ONLINE' ? (
                      <Link
                        to={`/deliveries/${d.id}/results`}
                        className="inline-block px-3.5 py-1.5 rounded-pill bg-ember text-white font-heading font-semibold text-xs hover:bg-ember/90 transition-colors"
                      >
                        Results Roster →
                      </Link>
                    ) : (
                      <span className="text-xs text-ink/50 italic px-3 py-1">
                        Print Ready
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Category 3: Students Roster (Grape Block - 5 cols) */}
        <section className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between border-l-4 border-grape pl-3">
            <div>
              <h2 className="font-heading font-bold text-xl text-ink">
                Enrolled Students
              </h2>
              <p className="text-xs text-ink/65">
                Students in your teaching scope
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="teacher-create-student-btn"
                onClick={() => setIsCreateStudentOpen(true)}
                className="px-2.5 py-1 text-xs font-heading font-semibold rounded-pill bg-grape text-white hover:bg-grape/90 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Student</span>
              </button>
              <span className="pill pill-grape text-xs">
                {students.length} Students
              </span>
            </div>
          </div>

          {isLoadingStudents && (
            <div className="p-8 text-center bg-surface border border-border rounded-lg text-ink/60">
              Loading student roster...
            </div>
          )}

          {studentsError && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-sm font-medium">
              {studentsError}
            </div>
          )}

          {!isLoadingStudents && !studentsError && (
            <div className="bg-surface border border-border rounded-lg p-4 shadow-card">
              {students.length === 0 ? (
                <div className="text-center py-6 text-xs text-ink/50 italic">
                  No students assigned to your current classroom scope.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {students.map((s) => {
                    const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
                    const canEdit = canEditUser(currentUser, s);

                    return (
                      <div key={s.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0">
                          <div className="font-heading font-semibold text-ink truncate">
                            {fullName || s.username}
                          </div>
                          <div className="font-mono text-[11px] text-ink/50 truncate">
                            @{s.username} {s.email ? `• ${s.email}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canEdit && (
                            <button
                              type="button"
                              id={`edit-student-${s.id}`}
                              onClick={() => setEditUserId(s.id)}
                              className="px-2 py-0.5 rounded-pill border border-border bg-surface text-ink hover:bg-forest hover:text-white transition-all text-[11px] font-heading font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                          <span className="font-mono text-[10px] text-ink/50 bg-bg px-2 py-0.5 rounded-sm">
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

      {/* Drawers & Modals */}
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

export const TeacherDashboard: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <TeacherDashboardMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <TeacherDashboardTablet key="tablet" />;
  }
  return <TeacherDashboardDesktop key="desktop" />;
};
