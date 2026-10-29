import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import { usersApi } from '../../../api/users';
import { useAuth } from '../../../auth/AuthContext';
import { CreateUserDrawer } from '../../../components/users/CreateUserDrawer';
import { UpdateUserModal } from '../../../components/users/UpdateUserModal';
import { canEditUser } from '../../../utils/userPermissions';
import { Plus, Edit2, Trash2, Lock, AlertCircle, CheckCircle2, X, Search, SlidersHorizontal, RotateCcw } from 'lucide-react';
import type { Paper, User, Delivery } from '../../../types';
import { getStaggerDelay, MOTION } from '../../../lib/motion';
import {
  SkeletonPaperGrid,
  SkeletonDeliveriesList,
  SkeletonCompactList,
} from '../../../components/ui/skeleton';
import { TeacherClassesSection } from '../../../components/teachers/TeacherClassesSection';
import { Pagination } from '../../../components/ui/pagination';
import { useToast } from '../../../context/ToastContext';

export const TeacherDashboardTablet: React.FC = () => {
  const { user: currentUser } = useAuth();
  const toast = useToast();
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

  // Pagination states
  const [papersPage, setPapersPage] = useState<number>(1);
  const PAPERS_PER_PAGE = 4; // 2 rows x 2 columns on tablet

  const [deliveriesPage, setDeliveriesPage] = useState<number>(1);
  const DELIVERIES_PER_PAGE = 5; // 5 entries per page

  const [studentsPage, setStudentsPage] = useState<number>(1);
  const STUDENTS_PER_PAGE = 8; // Vertically levels with the 5 Deliveries cards

  // Filter & Search states
  const [isPapersFilterOpen, setIsPapersFilterOpen] = useState(false);
  const [papersSearch, setPapersSearch] = useState('');
  const [papersSubjectFilter, setPapersSubjectFilter] = useState('ALL');
  const [papersSortOrder, setPapersSortOrder] = useState<'NEWEST' | 'OLDEST' | 'TITLE'>('NEWEST');

  const [isDeliveriesFilterOpen, setIsDeliveriesFilterOpen] = useState(false);
  const [deliveriesSearch, setDeliveriesSearch] = useState('');
  const [deliveriesModeFilter, setDeliveriesModeFilter] = useState<'ALL' | 'ONLINE' | 'PRINT'>('ALL');

  const [isStudentsFilterOpen, setIsStudentsFilterOpen] = useState(false);
  const [studentsSearch, setStudentsSearch] = useState('');

  // Extract distinct subjects from papers
  const distinctPaperSubjects = React.useMemo(() => {
    const subs = new Set<string>();
    papers.forEach((p) => {
      if (p.subjects && Array.isArray(p.subjects)) {
        p.subjects.forEach((s) => subs.add(s));
      }
    });
    return Array.from(subs).sort();
  }, [papers]);

  const hasActivePapersFilter = Boolean(papersSearch.trim() || papersSubjectFilter !== 'ALL' || papersSortOrder !== 'NEWEST');
  const hasActiveDeliveriesFilter = Boolean(deliveriesSearch.trim() || deliveriesModeFilter !== 'ALL');
  const hasActiveStudentsFilter = Boolean(studentsSearch.trim());

  const resetPapersFilters = () => {
    setPapersSearch('');
    setPapersSubjectFilter('ALL');
    setPapersSortOrder('NEWEST');
    setPapersPage(1);
  };

  const resetDeliveriesFilters = () => {
    setDeliveriesSearch('');
    setDeliveriesModeFilter('ALL');
    setDeliveriesPage(1);
  };

  // Filtered & Sorted Papers
  const filteredPapers = React.useMemo(() => {
    let result = [...papers];
    if (papersSearch.trim()) {
      const q = papersSearch.toLowerCase();
      result = result.filter((p) =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.chapter_title || '').toLowerCase().includes(q) ||
        String(p.id).includes(q)
      );
    }
    if (papersSubjectFilter !== 'ALL') {
      result = result.filter((p) => p.subjects && p.subjects.includes(papersSubjectFilter));
    }
    if (papersSortOrder === 'NEWEST') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (papersSortOrder === 'OLDEST') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (papersSortOrder === 'TITLE') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return result;
  }, [papers, papersSearch, papersSubjectFilter, papersSortOrder]);

  // Filtered Deliveries
  const filteredDeliveries = React.useMemo(() => {
    let result = [...deliveries];
    if (deliveriesSearch.trim()) {
      const q = deliveriesSearch.toLowerCase();
      result = result.filter((d) =>
        (d.paper_title || '').toLowerCase().includes(q) ||
        String(d.id).includes(q)
      );
    }
    if (deliveriesModeFilter !== 'ALL') {
      result = result.filter((d) => d.mode === deliveriesModeFilter);
    }
    return result;
  }, [deliveries, deliveriesSearch, deliveriesModeFilter]);

  // Filtered Students
  const filteredStudents = React.useMemo(() => {
    if (!studentsSearch.trim()) return students;
    const q = studentsSearch.toLowerCase();
    return students.filter((s) => {
      const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
      const username = (s.username || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      return name.includes(q) || username.includes(q) || email.includes(q);
    });
  }, [students, studentsSearch]);

  const paginatedPapers = React.useMemo(() => {
    const start = (papersPage - 1) * PAPERS_PER_PAGE;
    return filteredPapers.slice(start, start + PAPERS_PER_PAGE);
  }, [filteredPapers, papersPage]);

  const paginatedDeliveries = React.useMemo(() => {
    const start = (deliveriesPage - 1) * DELIVERIES_PER_PAGE;
    return filteredDeliveries.slice(start, start + DELIVERIES_PER_PAGE);
  }, [filteredDeliveries, deliveriesPage]);

  const paginatedStudents = React.useMemo(() => {
    const start = (studentsPage - 1) * STUDENTS_PER_PAGE;
    return filteredStudents.slice(start, start + STUDENTS_PER_PAGE);
  }, [filteredStudents, studentsPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredPapers.length / PAPERS_PER_PAGE));
    if (papersPage > maxPage) setPapersPage(1);
  }, [filteredPapers.length, papersPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredDeliveries.length / DELIVERIES_PER_PAGE));
    if (deliveriesPage > maxPage) setDeliveriesPage(1);
  }, [filteredDeliveries.length, deliveriesPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE));
    if (studentsPage > maxPage) setStudentsPage(1);
  }, [filteredStudents.length, studentsPage]);

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPapersFilterOpen(!isPapersFilterOpen)}
              className={`px-3 py-1.5 rounded-pill border transition-all flex items-center gap-1.5 text-xs cursor-pointer ${
                isPapersFilterOpen || hasActivePapersFilter
                  ? 'border-forest bg-forest/10 text-forest font-semibold shadow-xs'
                  : 'border-border bg-surface text-ink/70 hover:text-ink hover:border-forest/50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter & Sort</span>
              {hasActivePapersFilter && (
                <span className="w-1.5 h-1.5 rounded-full bg-forest" />
              )}
            </button>
            <span className="pill pill-forest text-xs">
              {filteredPapers.length !== papers.length ? `${filteredPapers.length} of ${papers.length}` : `${papers.length}`} Papers
            </span>
          </div>
        </div>

        {/* Expandable Micro-Toolbar for Papers */}
        {isPapersFilterOpen && (
          <div className="p-3.5 bg-surface border border-forest/30 rounded-card shadow-xs flex flex-wrap items-center gap-3 animate-fade-in text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={papersSearch}
                onChange={(e) => {
                  setPapersSearch(e.target.value);
                  setPapersPage(1);
                }}
                placeholder="Search title, chapter, or #ID..."
                className="w-full pl-8 pr-3 py-1.5 rounded-pill bg-surface-muted/50 border border-border text-xs focus:border-forest focus:outline-none"
              />
              {papersSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setPapersSearch('');
                    setPapersPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-ink/60 text-[11px] font-medium">Subject:</span>
              <select
                value={papersSubjectFilter}
                onChange={(e) => {
                  setPapersSubjectFilter(e.target.value);
                  setPapersPage(1);
                }}
                className="px-2.5 py-1.5 rounded-pill bg-surface-muted/50 border border-border text-xs focus:border-forest focus:outline-none font-medium text-ink cursor-pointer"
              >
                <option value="ALL">All Subjects</option>
                {distinctPaperSubjects.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-ink/60 text-[11px] font-medium">Sort:</span>
              <select
                value={papersSortOrder}
                onChange={(e) => {
                  setPapersSortOrder(e.target.value as any);
                  setPapersPage(1);
                }}
                className="px-2.5 py-1.5 rounded-pill bg-surface-muted/50 border border-border text-xs focus:border-forest focus:outline-none font-medium text-ink cursor-pointer"
              >
                <option value="NEWEST">Newest First</option>
                <option value="OLDEST">Oldest First</option>
                <option value="TITLE">Title (A-Z)</option>
              </select>
            </div>

            {hasActivePapersFilter && (
              <button
                type="button"
                onClick={resetPapersFilters}
                className="px-2.5 py-1 rounded-pill text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        )}

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

        {!isLoadingPapers && papers.length === 0 && (
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

        {!isLoadingPapers && !papersError && papers.length > 0 && filteredPapers.length === 0 && (
          <div className="bg-surface border border-border rounded-lg p-8 text-center space-y-2">
            <p className="text-xs text-ink/70 font-medium">No question papers match your filter criteria.</p>
            <button
              type="button"
              onClick={resetPapersFilters}
              className="text-xs text-forest font-semibold hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}

        {!isLoadingPapers && !papersError && filteredPapers.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {paginatedPapers.map((p, idx) => (
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
                      id={`tablet-delete-paper-${p.id}`}
                      onClick={() => {
                        setDeletePaperError(null);
                        setPaperToDelete(p);
                      }}
                      title={p.is_assigned ? 'Cannot delete: Paper has active deliveries' : 'Delete paper'}
                      className={`p-2 min-h-[40px] min-w-[40px] rounded-pill border transition-colors flex items-center justify-center text-xs cursor-pointer active:scale-95 ${
                        p.is_assigned
                          ? 'border-border/60 bg-surface-muted/60 text-ink/40'
                          : 'border-rose-200/80 bg-rose-50/40 text-rose-600 hover:bg-rose-100 hover:border-rose-300'
                      }`}
                    >
                      {p.is_assigned ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                    <Link
                      to={`/papers/${p.id}`}
                      className="px-4 py-2 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors min-h-[40px] flex items-center active:scale-95"
                    >
                      Open Studio →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination
          currentPage={papersPage}
          totalCount={filteredPapers.length}
          pageSize={PAPERS_PER_PAGE}
          onPageChange={setPapersPage}
          itemName="papers"
          className="mt-3"
        />
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDeliveriesFilterOpen(!isDeliveriesFilterOpen)}
                className={`px-2.5 py-1 rounded-pill border transition-all flex items-center gap-1 text-xs cursor-pointer ${
                  isDeliveriesFilterOpen || hasActiveDeliveriesFilter
                    ? 'border-ember bg-ember/10 text-ember font-semibold shadow-xs'
                    : 'border-border bg-surface text-ink/70 hover:text-ink hover:border-ember/50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filter</span>
                {hasActiveDeliveriesFilter && (
                  <span className="w-1.5 h-1.5 rounded-full bg-ember" />
                )}
              </button>
              <span className="pill pill-ember text-xs">
                {filteredDeliveries.length !== deliveries.length ? `${filteredDeliveries.length} of ${deliveries.length}` : `${deliveries.length}`}
              </span>
            </div>
          </div>

          {/* Expandable Micro-Toolbar for Deliveries */}
          {isDeliveriesFilterOpen && (
            <div className="p-3 bg-surface border border-ember/30 rounded-card shadow-xs flex flex-wrap items-center gap-2 animate-fade-in text-xs">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={deliveriesSearch}
                  onChange={(e) => {
                    setDeliveriesSearch(e.target.value);
                    setDeliveriesPage(1);
                  }}
                  placeholder="Search title or ID..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-pill bg-surface-muted/50 border border-border text-xs focus:border-ember focus:outline-none"
                />
                {deliveriesSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveriesSearch('');
                      setDeliveriesPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-surface-muted p-0.5 rounded-pill border border-border">
                {(['ALL', 'ONLINE', 'PRINT'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDeliveriesModeFilter(mode);
                      setDeliveriesPage(1);
                    }}
                    className={`px-2 py-0.5 rounded-pill text-[10px] font-medium transition-colors cursor-pointer ${
                      deliveriesModeFilter === mode
                        ? 'bg-ember text-white shadow-xs font-semibold'
                        : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    {mode === 'ALL' ? 'All' : mode === 'ONLINE' ? 'Online' : 'Print'}
                  </button>
                ))}
              </div>

              {hasActiveDeliveriesFilter && (
                <button
                  type="button"
                  onClick={resetDeliveriesFilters}
                  className="px-2 py-0.5 rounded-pill text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          )}

          {isLoadingDeliveries && (
            <SkeletonDeliveriesList count={2} />
          )}

          {deliveriesError && (
            <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
              {deliveriesError}
            </div>
          )}

          {!isLoadingDeliveries && !deliveriesError && deliveries.length > 0 && filteredDeliveries.length === 0 && (
            <div className="bg-surface border border-border rounded-lg p-6 text-center space-y-2">
              <p className="text-xs text-ink/70 font-medium">No test deliveries match your filter criteria.</p>
              <button
                type="button"
                onClick={resetDeliveriesFilters}
                className="text-xs text-ember font-semibold hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          )}

          {!isLoadingDeliveries && !deliveriesError && filteredDeliveries.length > 0 && (
            <div className="space-y-3">
              {paginatedDeliveries.map((d, idx) => (
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

              <Pagination
                currentPage={deliveriesPage}
                totalCount={filteredDeliveries.length}
                pageSize={DELIVERIES_PER_PAGE}
                onPageChange={setDeliveriesPage}
                itemName="deliveries"
                className="mt-3"
              />

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
                onClick={() => setIsStudentsFilterOpen(!isStudentsFilterOpen)}
                className={`p-1.5 rounded-pill border transition-all flex items-center gap-1 text-xs cursor-pointer ${
                  isStudentsFilterOpen || hasActiveStudentsFilter
                    ? 'border-grape bg-grape/10 text-grape font-semibold shadow-xs'
                    : 'border-border bg-surface text-ink/70 hover:text-ink hover:border-grape/50'
                }`}
                title="Search students"
              >
                <Search className="w-3.5 h-3.5" />
                {hasActiveStudentsFilter && (
                  <span className="w-1.5 h-1.5 rounded-full bg-grape" />
                )}
              </button>
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
                {filteredStudents.length !== students.length ? `${filteredStudents.length} of ${students.length}` : `${students.length}`}
              </span>
            </div>
          </div>

          {/* Expandable Micro-Search for Students */}
          {isStudentsFilterOpen && (
            <div className="p-2.5 bg-surface border border-grape/30 rounded-card shadow-xs flex items-center gap-2 animate-fade-in text-xs">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentsSearch}
                  onChange={(e) => {
                    setStudentsSearch(e.target.value);
                    setStudentsPage(1);
                  }}
                  placeholder="Search name, username, email..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-pill bg-surface-muted/50 border border-border text-xs focus:border-grape focus:outline-none"
                  autoFocus
                />
                {studentsSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentsSearch('');
                      setStudentsPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

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
                  {filteredStudents.length === 0 && students.length > 0 ? (
                    <div className="text-center py-6 text-xs text-ink/50 space-y-1">
                      <p>No students match &ldquo;{studentsSearch}&rdquo;</p>
                      <button
                        type="button"
                        onClick={() => { setStudentsSearch(''); setStudentsPage(1); }}
                        className="text-grape font-semibold hover:underline cursor-pointer"
                      >
                        Clear search
                      </button>
                    </div>
                  ) : (
                    paginatedStudents.map((s) => {
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
                  })
                )}
                </div>
              )}

              <Pagination
                currentPage={studentsPage}
                totalCount={filteredStudents.length}
                pageSize={STUDENTS_PER_PAGE}
                onPageChange={setStudentsPage}
                itemName="students"
                className="mt-3"
              />
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
                    className="px-5 py-2.5 rounded-pill bg-surface-muted border border-border text-ink font-heading font-semibold text-xs hover:bg-forest hover:text-white hover:border-forest transition-colors cursor-pointer min-h-[40px] active:scale-95"
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
                    className="px-4 py-2.5 rounded-pill border border-border text-ink/70 font-heading font-semibold text-xs hover:text-ink hover:border-ink/40 transition-colors cursor-pointer disabled:opacity-50 min-h-[40px] active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingPaper}
                    onClick={handleDeletePaper}
                    className="px-4 py-2.5 rounded-pill bg-rose-600 text-white font-heading font-semibold text-xs hover:bg-rose-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50 min-h-[40px] active:scale-95"
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
