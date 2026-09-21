import React from 'react';
import { DEOSubmissionsView } from '../../components/qbm/DEOSubmissionsView';
import { ValidatorQueueView } from '../../components/qbm/ValidatorQueueView';
import { ValidationStatusBadge } from '../../components/qbm/ValidationStatusBadge';
import {
  Database,
  Plus,
  Search,
  Layers,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Trash2,
  X,
  FileQuestion,
  Inbox,
  History,
} from 'lucide-react';
import { SearchableSubjectSelect } from '../../components/ui/searchable-subject-select';
import { CustomSelect } from '../../components/ui/custom-select';
import { Pagination } from '../../components/ui/pagination';
import { SkeletonQuestionGrid, SkeletonMetricCards } from '../../components/ui/skeleton';
import { getStaggerDelay, CARD_MOTION } from '../../lib/motion';
import { ValidationHistoryDrawer } from '../../components/qbm/ValidationHistoryDrawer';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useQBMDashboard } from '../../hooks/useQBMDashboard';
import { QBMDashboardMobile } from '../mobile/dashboards/QBMDashboardMobile';
import { QBMDashboardTablet } from '../tablet/dashboards/QBMDashboardTablet';

export interface QBMDashboardProps {
  initialTab?: 'explore' | 'ingest' | 'submissions' | 'validation';
}

const QBMDashboardDesktop: React.FC<QBMDashboardProps> = ({ initialTab }) => {
  const {
    isDEO, isValidator, isQBM,
    activeTab, setActiveTab,
    questions, totalCount, currentPage, setCurrentPage, pageSize, setPageSize,
    isLoadingQuestions, searchTerm, setSearchTerm,
    filterBoard, filterType, filterDifficulty, sortBy,
    selectedQuestion, setSelectedQuestion, historyQuestionId, setHistoryQuestionId, stats,
    handleBoardChange, handleTypeChange, handleDifficultyChange, handleSortChange,
    boards, books, chapters, topics,
    selectedBoard, setSelectedBoard, isNewBoard, setIsNewBoard, newBoardName, setNewBoardName,
    selectedBookId, setSelectedBookId, isNewBook, setIsNewBook, newBookTitle, setNewBookTitle, newBookSubject, setNewBookSubject, newBookGrade, setNewBookGrade,
    selectedChapterId, setSelectedChapterId, isNewChapter, setIsNewChapter, newChapterTitle, setNewChapterTitle,
    selectedTopicId, setSelectedTopicId, selectedTopicIds, setSelectedTopicIds, isNewTopic, setIsNewTopic, newTopicName, setNewTopicName,
    difficulty, setDifficulty, learnerLevel, setLearnerLevel, questionType, setQuestionType,
    marks, setMarks, questionText, setQuestionText, sourceReference, setSourceReference, explanation, setExplanation,
    options, correctAnswer, setCorrectAnswer, handleOptionChange, addOption, removeOption,
    variants, addVariant, removeVariant, updateVariant, addVariantOption, removeVariantOption, updateVariantOption,
    isSubmitting, ingestSuccessMsg, ingestErrorMsg, handleIngestSubmit,
    quickVariantModalQuestion, setQuickVariantModalQuestion,
    quickVariantType, setQuickVariantType, quickVariantMarks, setQuickVariantMarks,
    quickVariantText, setQuickVariantText, quickVariantAnswer, setQuickVariantAnswer,
    quickVariantExplanation, setQuickVariantExplanation,
    quickVariantOptions, isSubmittingQuickVariant,
    addQuickVariantOption, removeQuickVariantOption, updateQuickVariantOption, handleQuickVariantSubmit,
  } = useQBMDashboard(initialTab);


  // Display questions on current page (server-side filtered, sorted, and paginated)
  const displayQuestions = questions;
  const hasActiveFilters = Boolean(
    searchTerm.trim() || filterBoard !== 'ALL' || filterType !== 'ALL' || filterDifficulty !== 'ALL'
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── Page Header ── */}
      <div className="border-b border-border pb-6 flex flex-col xl:flex-row xl:items-end justify-between gap-5">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Central Question Bank Manager
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Curriculum Ingestion Engine
          </h1>
          <p className="font-body text-ink/75 text-base max-w-2xl leading-relaxed">
            Standardizing{' '}
            <span className="font-heading font-bold text-forest text-lg underline decoration-forest/40 underline-offset-2">
              {stats?.total_questions ?? totalCount} questions
            </span>{' '}
            and{' '}
            <span className="font-heading font-bold text-ember text-lg underline decoration-ember/40 underline-offset-2">
              {stats?.with_variants ?? 0} variants
            </span>{' '}
            across{' '}
            <span className="font-heading font-bold text-grape text-lg underline decoration-grape/40 underline-offset-2">
              {stats?.boards_count ?? (boards.length || 3)} curriculum boards
            </span>{' '}
            with multi-tier difficulty calibration.
          </p>
        </div>

        {/* View Switcher Tabs: Balanced 2x2 on Mobile, Single Row on Desktop */}
        <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-1.5 p-1.5 bg-surface-muted border border-border rounded-xl sm:rounded-pill w-full sm:w-auto shrink-0 shadow-xs">
          {(isQBM || (!isDEO && !isValidator)) && (
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className={`px-3.5 py-2 text-xs font-heading font-semibold rounded-lg sm:rounded-pill transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'explore'
                  ? 'bg-forest text-white shadow-xs'
                  : 'text-ink/70 hover:text-ink hover:bg-surface/60'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span>Question Explorer ({stats?.total_questions ?? totalCount})</span>
            </button>
          )}

          {(isQBM || isDEO || (!isDEO && !isValidator)) && (
            <button
              type="button"
              onClick={() => setActiveTab('ingest')}
              className={`px-3.5 py-2 text-xs font-heading font-semibold rounded-lg sm:rounded-pill transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'ingest'
                  ? 'bg-forest text-white shadow-xs'
                  : 'text-ink/70 hover:text-ink hover:bg-surface/60'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>{isDEO ? 'Enter Question' : 'Ingest Question'}</span>
            </button>
          )}

          {(isDEO || isQBM) && (
            <button
              type="button"
              onClick={() => setActiveTab('submissions')}
              className={`px-3.5 py-2 text-xs font-heading font-semibold rounded-lg sm:rounded-pill transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'submissions'
                  ? 'bg-forest text-white shadow-xs'
                  : 'text-ink/70 hover:text-ink hover:bg-surface/60'
              }`}
            >
              <FileQuestion className="w-3.5 h-3.5 shrink-0" />
              <span>My Submissions</span>
            </button>
          )}

          {(isValidator || isQBM) && (
            <button
              type="button"
              onClick={() => setActiveTab('validation')}
              className={`px-3.5 py-2 text-xs font-heading font-semibold rounded-lg sm:rounded-pill transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'validation'
                  ? 'bg-forest text-white shadow-xs'
                  : 'text-ink/70 hover:text-ink hover:bg-surface/60'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span>Review Queue</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Metric Highlights ── */}
      {!stats ? (
        <SkeletonMetricCards count={4} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">Global Repository</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">
              {stats.total_questions ?? totalCount}
            </div>
            <p className="text-[11px] text-forest font-medium mt-0.5">Platform Available</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">With Variants</span>
            <div className="font-heading font-bold text-2xl text-forest mt-1">
              {stats.with_variants ?? 0}
            </div>
            <p className="text-[11px] text-ink/60 mt-0.5">Difficulty Locked</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">Curriculum Boards</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">
              {stats.boards_count ?? (boards.length || 3)}
            </div>
            <p className="text-[11px] text-ink/60 mt-0.5">CBSE, ICSE & State</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">Active Chapters</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">
              {stats.active_chapters ?? (chapters.length || 1)}
            </div>
            <p className="text-[11px] text-ink/60 mt-0.5">Structured Topics</p>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: QUESTION EXPLORER                                                 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'explore' && (
        <div className="space-y-6">
          {/* Filter Toolbar */}
          <div className="space-y-3">
            <div className="bg-surface border border-border rounded-card p-3 shadow-card flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter by question, topic, chapter, book..."
                  className="w-full pl-9 pr-8 py-2 rounded-pill border border-border bg-bg text-xs font-body text-ink focus:outline-none focus:border-forest"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Board selector */}
              <CustomSelect
                id="qbm-filter-board"
                value={filterBoard}
                onChange={(val) => handleBoardChange(val)}
                options={[{ value: 'ALL', label: 'All Boards' }, ...boards.map((b) => ({ value: b, label: b }))]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg"
                className="w-auto min-w-[130px]"
              />

              {/* Type filter */}
              <CustomSelect
                id="qbm-filter-type"
                value={filterType}
                onChange={(val) => handleTypeChange(val)}
                options={[
                  { value: 'ALL', label: 'All Question Types' },
                  { value: 'MCQ', label: 'Multiple Choice (MCQ)' },
                  { value: 'MSQ', label: 'Multiple Select (MSQ)' },
                  { value: 'SHORT_ANSWER', label: 'Short Answer' },
                  { value: 'LONG_ANSWER', label: 'Long Answer' },
                  { value: 'FILL_IN_THE_BLANKS', label: 'Fill in Blanks' },
                  { value: 'ONE_WORD', label: 'One Word' },
                  { value: 'MATCH_THE_FOLLOWING', label: 'Match the Following' },
                  { value: 'DIAGRAM_BASED', label: 'Diagram Based' },
                  { value: 'COMPREHENSION_BASED', label: 'Comprehension Based' },
                ]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg"
                className="w-auto min-w-[160px]"
              />

              {/* Difficulty filter */}
              <CustomSelect
                id="qbm-filter-difficulty"
                value={filterDifficulty}
                onChange={(val) => handleDifficultyChange(val)}
                options={[
                  { value: 'ALL', label: 'All Difficulties' },
                  { value: 'EASY', label: 'Easy' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HARD', label: 'Hard' },
                ]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg"
                className="w-auto min-w-[130px]"
              />

              {/* Sort Order Selector */}
              <CustomSelect
                id="qbm-sort-order"
                value={sortBy}
                onChange={(val) => handleSortChange(val)}
                options={[
                  { value: 'newest', label: 'Sort: Newest First' },
                  { value: 'oldest', label: 'Sort: Oldest First' },
                  { value: 'marks_desc', label: 'Sort: Marks (High → Low)' },
                  { value: 'marks_asc', label: 'Sort: Marks (Low → High)' },
                  { value: 'difficulty_asc', label: 'Sort: Difficulty (Easy → Hard)' },
                  { value: 'difficulty_desc', label: 'Sort: Difficulty (Hard → Easy)' },
                  { value: 'text_asc', label: 'Sort: Question Text (A–Z)' },
                ]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg"
                className="w-auto min-w-[160px]"
              />
            </div>

            {/* Active Filters Bar */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                <span className="text-ink/60 font-medium">Active filters:</span>
                {searchTerm.trim() && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-ink font-medium shadow-2xs">
                    Search: "{searchTerm}"
                    <button type="button" onClick={() => setSearchTerm('')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterBoard !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-forest/10 border border-forest/20 text-forest font-medium shadow-2xs">
                    Board: {filterBoard}
                    <button type="button" onClick={() => handleBoardChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterType !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-forest/10 border border-forest/20 text-forest font-medium shadow-2xs">
                    Type: {filterType}
                    <button type="button" onClick={() => handleTypeChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterDifficulty !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-amber-50 border border-amber-200 text-amber-800 font-medium shadow-2xs">
                    Diff: {filterDifficulty}
                    <button type="button" onClick={() => handleDifficultyChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    handleBoardChange('ALL');
                    handleTypeChange('ALL');
                    handleDifficultyChange('ALL');
                  }}
                  className="text-xs font-semibold text-forest hover:underline cursor-pointer ml-1"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </div>

          {/* Question Cards Grid */}
          {isLoadingQuestions ? (
            <SkeletonQuestionGrid count={6} />
          ) : displayQuestions.length === 0 ? (
            <div className="bg-surface border-2 border-dashed border-border rounded-lg p-12 text-center space-y-3 shadow-card">
              <span className="pill pill-forest text-xs">Repository Ready</span>
              <FileQuestion className="w-10 h-10 text-ink/30 mx-auto" />
              <h3 className="font-heading font-semibold text-ink text-sm">No Questions Found</h3>
              <p className="text-xs text-ink/60 max-w-sm mx-auto">
                No questions match your filter or search criteria, or none have been ingested yet.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('ingest')}
                className="mt-2 px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Ingest New Question
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={getStaggerDelay(idx)}
                    onClick={() => setSelectedQuestion(q)}
                    className={`bg-surface border border-border hover:border-forest/50 transition-all rounded-card p-4 shadow-card flex flex-col justify-between cursor-pointer group ${CARD_MOTION.interactive}`}
                  >
                    <div className="space-y-2.5">
                      {/* Tags row */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <ValidationStatusBadge status={q.validation_status} revision={q.revision} />
                          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-forest/10 text-forest border border-forest/20">
                            {q.question_type_display || q.question_type}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-surface-muted text-ink/70 border border-border">
                            {q.marks} Marks
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill ${
                              q.difficulty === 'EASY'
                               ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : q.difficulty === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {q.difficulty}
                          </span>
                          {(q.variants_count || 0) > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-pill bg-grape/10 text-grape border border-grape/20">
                              {q.variants_count} Variant(s)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Question text */}
                      <p className="text-xs text-ink font-medium line-clamp-3 leading-relaxed">
                        {q.question_text}
                      </p>
                    </div>

                    {/* Context footer */}
                    <div className="border-t border-border mt-3 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink/60">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate max-w-[180px]">
                          {q.chapter_title ? `${q.chapter_title} • ` : ''}
                          {q.topic_name || 'General Topic'}
                        </span>
                        <span className="text-ink/40">•</span>
                        <span className="font-mono text-[10px] text-ink/70">
                          By: <strong className="text-ink">{q.created_by_name || 'System'}</strong> ({q.school_name || 'Global'})
                        </span>
                      </div>
                      <span className="font-heading font-semibold text-forest group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[11px]">
                        Details & Variants <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={currentPage}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={(page) => setCurrentPage(page)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[10, 20, 50]}
                itemName="questions"
              />
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: STRUCTURED INGESTION WORKFLOW                                     */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'ingest' && (
        <form onSubmit={handleIngestSubmit} className="space-y-8 bg-surface border border-border rounded-lg p-6 sm:p-8 shadow-card">
          {/* Notifications */}
          {ingestSuccessMsg && (
            <div className="p-4 rounded-card bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{ingestSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('explore')}
                className="font-heading underline font-semibold text-emerald-900 cursor-pointer"
              >
                View in Explorer
              </button>
            </div>
          )}

          {ingestErrorMsg && (
            <div className="p-4 rounded-card bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{ingestErrorMsg}</span>
            </div>
          )}

          {/* ── STEP 1: Hierarchy Selection (Board → Book → Chapter → Topic) ── */}
          <section className="space-y-4">
            <div className="border-b border-border pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">
                  Curriculum Hierarchy (Board → Book → Chapter → Topic)
                </h2>
              </div>
              <div className="text-[11px] text-ink/60 flex items-center gap-1.5 bg-surface-muted/50 px-2.5 py-1 rounded border border-border">
                <span className="font-semibold text-ink">Tip:</span>
                <span>Select previously filled entries or click <span className="font-semibold text-forest">+ New</span> at any level to add new items.</span>
              </div>
            </div>

            {/* Visual Target Hierarchy Breadcrumb */}
            <div className="p-3 bg-surface-muted/40 rounded-card border border-border/80 text-xs flex flex-wrap items-center gap-2">
              <span className="font-heading font-semibold text-ink/60 uppercase tracking-wide text-[10px]">
                Target Hierarchy:
              </span>
              {/* Board crumb */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-ink">
                  {isNewBoard ? (newBoardName.trim() || 'New Board') : selectedBoard}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isNewBoard ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {isNewBoard ? 'NEW' : 'EXISTING'}
                </span>
              </div>
              <span className="text-ink/40">›</span>
              {/* Book crumb */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-ink">
                  {isNewBook
                    ? (newBookTitle.trim() || (newBookSubject.trim() ? `${newBookSubject} (${newBookGrade})` : 'New Book'))
                    : (books.find((b) => b.id === Number(selectedBookId))?.title || 'Select Book')}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isNewBook ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {isNewBook ? 'NEW' : 'EXISTING'}
                </span>
              </div>
              <span className="text-ink/40">›</span>
              {/* Chapter crumb */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-ink">
                  {isNewChapter
                    ? (newChapterTitle.trim() || 'New Chapter')
                    : (chapters.find((c) => c.id === Number(selectedChapterId))?.title || 'Select Chapter')}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isNewChapter ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {isNewChapter ? 'NEW' : 'EXISTING'}
                </span>
              </div>
              <span className="text-ink/40">›</span>
              {/* Topic crumb */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-ink">
                  {isNewTopic
                    ? (newTopicName.trim() || 'New Topic')
                    : (topics.find((t) => t.id === Number(selectedTopicId))?.name || 'Select Topic')}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isNewTopic ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {isNewTopic ? 'NEW' : 'EXISTING'}
                </span>
              </div>
            </div>

            {/* 4 Hierarchy Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* 1. Board Card */}
              <div className="p-4 rounded-card bg-surface border border-border flex flex-col justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                    <label className="font-heading text-xs font-bold text-ink">
                      1. Board *
                    </label>
                    {!isNewBoard ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewBoard(true);
                          setSelectedBoard('');
                        }}
                        className="text-[11px] text-forest hover:underline font-semibold cursor-pointer"
                      >
                        + New Board
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewBoard(false);
                          if (boards.length > 0) setSelectedBoard(boards[0]);
                        }}
                        className="text-[11px] text-ink/60 hover:underline font-medium cursor-pointer"
                      >
                        ← Existing Boards
                      </button>
                    )}
                  </div>

                  <div className="mt-2.5">
                    {!isNewBoard ? (
                      <CustomSelect
                        value={selectedBoard}
                        onChange={(val) => {
                          if (val === '__NEW__') {
                            setIsNewBoard(true);
                            setSelectedBoard('');
                          } else {
                            setSelectedBoard(val);
                          }
                        }}
                        options={[
                          ...boards.map((b) => ({ value: b, label: b })),
                          { value: '__NEW__', label: '+ Add New Board...', badge: 'NEW' },
                        ]}
                        placeholder="Select a board..."
                        className="w-full"
                      />
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={newBoardName}
                          onChange={(e) => setNewBoardName(e.target.value)}
                          placeholder="e.g. Cambridge IGCSE, Goa Board"
                          className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none"
                          required
                          autoFocus
                        />
                        <p className="text-[11px] text-ink/60">
                          Creating a new board will allow adding its books below.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Book / Curriculum Card */}
              <div className="p-4 rounded-card bg-surface border border-border flex flex-col justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                    <label className="font-heading text-xs font-bold text-ink">
                      2. Book / Curriculum *
                    </label>
                    {!isNewBook ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewBook(true);
                          setSelectedBookId('NEW');
                        }}
                        className="text-[11px] text-forest hover:underline font-semibold cursor-pointer"
                      >
                        + New Book
                      </button>
                    ) : (
                      books.length > 0 && !isNewBoard && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewBook(false);
                            setSelectedBookId(books[0].id);
                          }}
                          className="text-[11px] text-ink/60 hover:underline font-medium cursor-pointer"
                        >
                          ← Existing ({books.length})
                        </button>
                      )
                    )}
                  </div>

                  <div className="mt-2.5">
                    {!isNewBook && books.length > 0 ? (
                      <CustomSelect
                        value={String(selectedBookId)}
                        onChange={(val) => {
                          if (val === '__NEW__') {
                            setIsNewBook(true);
                            setSelectedBookId('NEW');
                          } else {
                            setSelectedBookId(Number(val));
                          }
                        }}
                        options={[
                          ...books.map((bk) => ({ value: String(bk.id), label: `${bk.title} (${bk.grade})` })),
                          { value: '__NEW__', label: '+ Add New Book...', badge: 'NEW' },
                        ]}
                        placeholder="Select a book..."
                        className="w-full"
                      />
                    ) : (
                      <div className="space-y-2">
                        {books.length === 0 && !isNewBoard && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-1.5 rounded">
                            No books yet for {selectedBoard}. Fill details to create one:
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] font-semibold text-ink/70 mb-0.5">Subject *</label>
                          <SearchableSubjectSelect
                            value={newBookSubject}
                            onChange={setNewBookSubject}
                            placeholder="Subject (e.g. Mathematics)..."
                            required={isNewBook}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-ink/70 mb-0.5">Grade *</label>
                            <CustomSelect
                              value={newBookGrade}
                              onChange={setNewBookGrade}
                              options={[
                                'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                                'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
                                'Class 11', 'Class 12'
                              ]}
                              placeholder="Select grade..."
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-ink/70 mb-0.5">Book Title</label>
                            <input
                              type="text"
                              value={newBookTitle}
                              onChange={(e) => setNewBookTitle(e.target.value)}
                              placeholder="e.g. Balbharati 7"
                              className="w-full rounded-card border border-border bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Chapter Card */}
              <div className="p-4 rounded-card bg-surface border border-border flex flex-col justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                    <label className="font-heading text-xs font-bold text-ink">
                      3. Chapter *
                    </label>
                    {!isNewChapter ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewChapter(true);
                          setSelectedChapterId('NEW');
                        }}
                        className="text-[11px] text-forest hover:underline font-semibold cursor-pointer"
                      >
                        + New Chapter
                      </button>
                    ) : (
                      chapters.length > 0 && !isNewBook && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewChapter(false);
                            setSelectedChapterId(chapters[0].id);
                          }}
                          className="text-[11px] text-ink/60 hover:underline font-medium cursor-pointer"
                        >
                          ← Existing ({chapters.length})
                        </button>
                      )
                    )}
                  </div>

                  <div className="mt-2.5">
                    {!isNewChapter && chapters.length > 0 ? (
                      <CustomSelect
                        value={String(selectedChapterId)}
                        onChange={(val) => {
                          if (val === '__NEW__') {
                            setIsNewChapter(true);
                            setSelectedChapterId('NEW');
                          } else {
                            setSelectedChapterId(Number(val));
                          }
                        }}
                        options={[
                          ...chapters.map((ch) => ({ value: String(ch.id), label: `Ch.${ch.chapter_order}: ${ch.title}` })),
                          { value: '__NEW__', label: '+ Add New Chapter...', badge: 'NEW' },
                        ]}
                        placeholder="Select a chapter..."
                        className="w-full"
                      />
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={newChapterTitle}
                          onChange={(e) => setNewChapterTitle(e.target.value)}
                          placeholder="e.g. Ch. 1: Kavita / Quadratic Eqns"
                          className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none"
                          required={isNewChapter}
                        />
                        <p className="text-[11px] text-ink/60">
                          {isNewBook
                            ? 'New chapter will be created under the new book.'
                            : 'Will create a new chapter in this existing book.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Topic Card */}
              <div className="p-4 rounded-card bg-surface border border-border flex flex-col justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                    <label className="font-heading text-xs font-bold text-ink">
                      4. Topic *
                    </label>
                    {!isNewTopic ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewTopic(true);
                          setSelectedTopicId('NEW');
                        }}
                        className="text-[11px] text-forest hover:underline font-semibold cursor-pointer"
                      >
                        + New Topic
                      </button>
                    ) : (
                      topics.length > 0 && !isNewChapter && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewTopic(false);
                            setSelectedTopicId(topics[0].id);
                          }}
                          className="text-[11px] text-ink/60 hover:underline font-medium cursor-pointer"
                        >
                          ← Existing ({topics.length})
                        </button>
                      )
                    )}
                  </div>

                  <div className="mt-2.5 space-y-2">
                    {!isNewTopic && topics.length > 0 ? (
                      <>
                        {/* Selected Topic Pills */}
                        <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-bg rounded-card border border-border">
                          {selectedTopicIds.length === 0 && (
                            <span className="text-[11px] text-ink/40 font-mono">No topics selected.</span>
                          )}
                          {selectedTopicIds.map((tId) => {
                            const tObj = topics.find((tp) => tp.id === tId);
                            const name = tObj ? tObj.name : `Topic #${tId}`;
                            return (
                              <span
                                key={tId}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[11px] bg-surface border border-border text-ink font-medium shadow-2xs"
                              >
                                <span>{name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = selectedTopicIds.filter((id) => id !== tId);
                                    setSelectedTopicIds(next);
                                    if (next.length > 0) setSelectedTopicId(next[0]);
                                  }}
                                  className="text-ink/40 hover:text-ink cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>

                        {/* Add Topic Selector */}
                        <CustomSelect
                          value=""
                          onChange={(val) => {
                            if (val === '__NEW__') {
                              setIsNewTopic(true);
                              setSelectedTopicId('NEW');
                            } else if (val) {
                              const numVal = Number(val);
                              if (!selectedTopicIds.includes(numVal)) {
                                const next = [...selectedTopicIds, numVal];
                                setSelectedTopicIds(next);
                                setSelectedTopicId(next[0]);
                              }
                            }
                          }}
                          options={[
                            ...topics.map((tp) => ({
                              value: String(tp.id),
                              label: `${tp.name}${selectedTopicIds.includes(tp.id) ? ' (Selected)' : ''}`,
                            })),
                            { value: '__NEW__', label: '+ Create New Topic...', badge: 'NEW' },
                          ]}
                          placeholder="+ Add Topic Tag..."
                          className="w-full"
                        />
                        <p className="text-[10px] text-ink/50">
                          Multi-topic tagging supported (PDF Section 9). Select multiple topics under this chapter.
                        </p>
                      </>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={newTopicName}
                          onChange={(e) => setNewTopicName(e.target.value)}
                          placeholder="e.g. Poem / Nature of Roots"
                          className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none"
                          required={isNewTopic}
                        />
                        <p className="text-[11px] text-ink/60">
                          {isNewChapter
                            ? 'New topic will be added to the new chapter.'
                            : 'Will create a new topic in this chapter.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── STEP 2: Difficulty & Marks ── */}
          <section className="space-y-4">
            <div className="border-b border-border pb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center">
                2
              </span>
              <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">
                Evaluation Metrics & Difficulty Calibration
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Difficulty */}
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-semibold text-ink">
                  Difficulty (Locks Child Variants) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficulty(diff)}
                      className={`py-2 text-xs font-heading font-semibold rounded-card border transition-all cursor-pointer ${
                        difficulty === diff
                          ? 'border-forest bg-forest text-white shadow-xs'
                          : 'border-border bg-bg text-ink hover:border-forest/50'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Learner Level */}
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-semibold text-ink">
                  Target Learner Level *
                </label>
                <CustomSelect
                  value={learnerLevel}
                  onChange={(val) => setLearnerLevel(val as any)}
                  options={[
                    { value: 'BEGINNER', label: 'Beginner (Foundational)' },
                    { value: 'INTERMEDIATE', label: 'Intermediate (Competency)' },
                    { value: 'ADVANCED', label: 'Advanced (HOTS)' },
                  ]}
                  placeholder="Select learner level..."
                  className="w-full"
                />
              </div>

              {/* Base Marks */}
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-semibold text-ink">
                  Primary Marks *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="100"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none font-mono"
                />
              </div>
            </div>
          </section>

          {/* ── STEP 3: Question Content & Options Builder ── */}
          <section className="space-y-4">
            <div className="border-b border-border pb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">
                Question Content & Format
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-semibold text-ink">
                  Question Format / Type *
                </label>
                <CustomSelect
                  value={questionType}
                  onChange={(val) => setQuestionType(val)}
                  options={[
                    { value: 'MCQ', label: 'Multiple Choice Question (Single Select)' },
                    { value: 'MSQ', label: 'Multiple Select Question (MSQ)' },
                    { value: 'SHORT_ANSWER', label: 'Short Answer (1-2 Marks)' },
                    { value: 'LONG_ANSWER', label: 'Long Answer (3-5 Marks)' },
                    { value: 'FILL_IN_THE_BLANKS', label: 'Fill in the Blanks' },
                    { value: 'ONE_WORD', label: 'One Word Response' },
                    { value: 'MATCH_THE_FOLLOWING', label: 'Match the Following' },
                    { value: 'DIAGRAM_BASED', label: 'Diagram Based Question' },
                    { value: 'COMPREHENSION_BASED', label: 'Case Study / Comprehension Based' },
                  ]}
                  placeholder="Select question type..."
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-medium text-ink">
                  Textbook / Section Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NCERT Grade 10 Ch 4 Ex 4.2 Q1"
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none"
                />
              </div>
            </div>

            {/* Question Text */}
            <div className="space-y-1.5">
              <label className="block font-heading text-xs font-semibold text-ink">
                Question Statement *
              </label>
              <textarea
                rows={4}
                required
                placeholder="Enter the complete question statement, problem setup, or instructions..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none leading-relaxed"
              />
            </div>

            {/* Dynamic Options Builder for Choice questions */}
            {['MCQ', 'MSQ', 'MATCH_THE_FOLLOWING'].includes(questionType) && (
              <div className="bg-bg border border-border rounded-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-semibold text-xs text-ink">
                    Answer Choices / Options
                  </span>
                  {options.length < 6 && (
                    <button
                      type="button"
                      onClick={addOption}
                      className="text-[11px] font-heading font-semibold text-forest hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Choice
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <div key={opt.key} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-card bg-surface border border-border text-[11px] font-mono font-bold flex items-center justify-center text-ink shrink-0">
                        {opt.key}
                      </span>
                      <input
                        type="text"
                        required
                        placeholder={`Option ${opt.key} text`}
                        value={opt.text}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        className="flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOption(idx)}
                          className="p-1 text-ink/40 hover:text-ember cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Correct Answer */}
            <div className="space-y-1.5">
              <label className="block font-heading text-xs font-semibold text-ink">
                Correct Answer / Scoring Rubric *
              </label>
              {questionType === 'MCQ' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink/70">Correct Choice:</span>
                  <CustomSelect
                    value={correctAnswer}
                    onChange={(val) => setCorrectAnswer(val)}
                    options={options.map((opt) => ({
                      value: opt.key,
                      label: `Option ${opt.key}${opt.text ? `: ${opt.text.substring(0, 24)}...` : ''}`,
                    }))}
                    placeholder="Select correct choice..."
                    className="w-48"
                  />
                </div>
              ) : (
                <textarea
                  rows={2}
                  required
                  placeholder="Enter exact key, phrase, or evaluation grading criteria..."
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none leading-relaxed"
                />
              )}
            </div>

            {/* Explanation / Solution */}
            <div className="space-y-1.5">
              <label className="block font-heading text-xs font-medium text-ink">
                Pedagogical Explanation & Hints
              </label>
              <textarea
                rows={2}
                placeholder="Provide conceptual step-by-step reasoning or hints for evaluating faculty..."
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none leading-relaxed"
              />
            </div>
          </section>

          {/* ── STEP 4: Question Variants Architecture ── */}
          <section className="space-y-4">
            <div className="border-b border-border pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center">
                  4
                </span>
                <div>
                  <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">
                    Question Variants Architecture
                  </h2>
                  <p className="text-[11px] text-ink/60">
                    Difficulty is strictly locked to parent difficulty (<strong>{difficulty}</strong>) to prevent evaluation bias.
                  </p>
                </div>
              </div>

              {/* Quick Template Variant Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addVariant('2.00', 'SHORT_ANSWER')}
                  className="px-2.5 py-1 text-[11px] font-heading font-semibold rounded-pill bg-forest/10 border border-forest/20 text-forest hover:bg-forest/20 cursor-pointer"
                >
                  + 2-Mark Variant
                </button>
                <button
                  type="button"
                  onClick={() => addVariant('3.00', 'SHORT_ANSWER')}
                  className="px-2.5 py-1 text-[11px] font-heading font-semibold rounded-pill bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 cursor-pointer"
                >
                  + 3-Mark Variant
                </button>
                <button
                  type="button"
                  onClick={() => addVariant('5.00', 'LONG_ANSWER')}
                  className="px-2.5 py-1 text-[11px] font-heading font-semibold rounded-pill bg-grape/10 border border-grape/20 text-grape hover:bg-grape/20 cursor-pointer"
                >
                  + 5-Mark Variant
                </button>
              </div>
            </div>

            {/* Variants List */}
            {variants.length === 0 ? (
              <div className="border border-dashed border-border rounded-card p-6 text-center text-xs text-ink/60 space-y-1">
                <Layers className="w-6 h-6 text-ink/30 mx-auto mb-1" />
                <p>No variants attached yet. Click above to append 2-mark, 3-mark, or 5-mark variants.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {variants.map((v, idx) => (
                  <div key={idx} className="bg-bg border border-border rounded-card p-4 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-xs text-ink">
                          Variant #{idx + 1}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono rounded-pill bg-forest/10 text-forest border border-forest/20">
                          {v.marks}m
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono rounded-pill bg-surface border border-border text-ink/70">
                          Difficulty: {difficulty} (Inherited)
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeVariant(idx)}
                        className="text-ink/40 hover:text-rose-600 p-1 cursor-pointer"
                        title="Remove variant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Variant Format</label>
                        <CustomSelect
                          value={v.variant_type}
                          onChange={(val) => updateVariant(idx, 'variant_type', val)}
                          options={[
                            { value: 'SHORT_ANSWER', label: 'Short Answer' },
                            { value: 'LONG_ANSWER', label: 'Long Answer' },
                            { value: 'MCQ', label: 'Multiple Choice' },
                            { value: 'FILL_IN_THE_BLANKS', label: 'Fill in the Blanks' },
                            { value: 'ONE_WORD', label: 'One Word' },
                          ]}
                          placeholder="Select format..."
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Marks</label>
                        <input
                          type="number"
                          step="0.5"
                          value={v.marks}
                          onChange={(e) => updateVariant(idx, 'marks', e.target.value)}
                          className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink font-mono focus:border-forest focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-ink">Variant Question Text *</label>
                      <textarea
                        rows={2}
                        required
                        value={v.question_text}
                        onChange={(e) => updateVariant(idx, 'question_text', e.target.value)}
                        placeholder="Enter the variant prompt text..."
                        className="w-full rounded-card border border-border bg-surface p-2.5 text-xs text-ink focus:border-forest focus:outline-none"
                      />
                    </div>

                    {/* Dynamic Options Builder for MCQ Variant */}
                    {v.variant_type === 'MCQ' && (
                      <div className="bg-surface border border-border rounded-card p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-semibold text-xs text-ink">
                            Variant Answer Choices / Options
                          </span>
                          {(v.options?.length || 0) < 6 && (
                            <button
                              type="button"
                              onClick={() => addVariantOption(idx)}
                              className="text-[11px] font-heading font-semibold text-forest hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Add Choice
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {(v.options || []).map((opt, optIdx) => (
                            <div key={opt.key} className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-card bg-surface-muted border border-border text-[11px] font-mono font-bold flex items-center justify-center text-ink shrink-0">
                                {opt.key}
                              </span>
                              <input
                                type="text"
                                required
                                placeholder={`Option ${opt.key} text`}
                                value={opt.text}
                                onChange={(e) => updateVariantOption(idx, optIdx, e.target.value)}
                                className="flex-1 rounded-card border border-border bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                              />
                              {(v.options?.length || 0) > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeVariantOption(idx, optIdx)}
                                  className="p-1 text-ink/40 hover:text-ember cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Variant Answer *</label>
                        {v.variant_type === 'MCQ' ? (
                          <CustomSelect
                            value={v.correct_answer || 'A'}
                            onChange={(val) => updateVariant(idx, 'correct_answer', val)}
                            options={(v.options || []).map((opt) => ({
                              value: opt.key,
                              label: `Option ${opt.key}${opt.text ? `: ${opt.text.substring(0, 20)}...` : ''}`,
                            }))}
                            placeholder="Select correct choice..."
                            className="w-full"
                          />
                        ) : (
                          <input
                            type="text"
                            required
                            value={v.correct_answer}
                            onChange={(e) => updateVariant(idx, 'correct_answer', e.target.value)}
                            placeholder="Correct key or scoring note"
                            className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Variant Hint / Explanation</label>
                        <input
                          type="text"
                          value={v.explanation}
                          onChange={(e) => updateVariant(idx, 'explanation', e.target.value)}
                          placeholder="Optional explanation"
                          className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Submit Action ── */}
          <div className="border-t border-border pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className="px-4 py-2.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Ingesting to Global Bank...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ingest Question + {variants.length} Variants</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: DEO MY SUBMISSIONS WORKSPACE (Task 8)                            */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'submissions' && (
        <DEOSubmissionsView onNewQuestionClick={() => setActiveTab('ingest')} />
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: VALIDATOR REVIEW QUEUE WORKSPACE (Task 8)                        */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'validation' && (
        <ValidatorQueueView />
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* QUESTION DETAIL MODAL                                                    */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
            onClick={() => setSelectedQuestion(null)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-surface border border-border rounded-lg shadow-float max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <ValidationStatusBadge status={selectedQuestion.validation_status} revision={selectedQuestion.revision} />
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-forest/10 text-forest border border-forest/20">
                    {selectedQuestion.question_type_display || selectedQuestion.question_type}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-surface-muted text-ink/70 border border-border">
                    {selectedQuestion.marks} Marks
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-surface-muted text-ink/70 border border-border">
                    {selectedQuestion.difficulty}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-heading font-bold text-base text-ink">
                    Question #{selectedQuestion.id}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setHistoryQuestionId(selectedQuestion.id)}
                    className="px-2.5 py-0.5 rounded-pill bg-surface-muted border border-border text-xs font-mono text-ink/80 hover:text-ink hover:border-forest/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-forest" />
                    <span>Audit History</span>
                  </button>
                </div>
                <p className="text-[11px] font-mono text-ink/60 mt-1">
                  Author: <strong className="text-ink">{selectedQuestion.created_by_name || 'System'}</strong> {selectedQuestion.created_by_role ? `(${selectedQuestion.created_by_role})` : ''} • School: <strong className="text-forest">{selectedQuestion.school_name || 'Global Curriculum'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuestion(null)}
                className="p-1 rounded-card border border-border bg-surface-muted text-ink/70 hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Question Text */}
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Question Statement</span>
              <p className="text-xs text-ink font-medium leading-relaxed bg-bg p-3.5 rounded-card border border-border">
                {selectedQuestion.question_text}
              </p>
            </div>

            {/* Options if any */}
            {selectedQuestion.options && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Choices</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(selectedQuestion.options).map(([k, v]) => (
                    <div
                      key={k}
                      className={`p-2 rounded-card text-xs border flex items-center gap-2 ${
                        selectedQuestion.correct_answer === k
                          ? 'border-forest bg-forest/5 text-forest font-semibold'
                          : 'border-border bg-surface text-ink'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-surface-muted border border-border text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                        {k}
                      </span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Answer & Explanation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Correct Answer</span>
                <div className="p-2.5 rounded-card border border-border bg-bg text-xs font-mono font-bold text-forest">
                  {selectedQuestion.correct_answer}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Source Reference</span>
                <div className="p-2.5 rounded-card border border-border bg-bg text-xs text-ink/70">
                  {selectedQuestion.source_reference || 'N/A'}
                </div>
              </div>
            </div>

            {selectedQuestion.explanation && (
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Pedagogical Explanation</span>
                <p className="p-2.5 rounded-card border border-border bg-bg text-xs text-ink/80 leading-relaxed">
                  {selectedQuestion.explanation}
                </p>
              </div>
            )}

            {/* Variants Section */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-xs text-ink uppercase tracking-wider">
                  Associated Variants ({selectedQuestion.variants?.length || 0})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQuickVariantModalQuestion(selectedQuestion);
                  }}
                  className="px-3 py-1 text-xs font-heading font-semibold rounded-pill bg-forest/10 border border-forest/20 text-forest hover:bg-forest/20 cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Append Variant
                </button>
              </div>

              {(!selectedQuestion.variants || selectedQuestion.variants.length === 0) ? (
                <p className="text-xs text-ink/50 italic">No variants yet for this question.</p>
              ) : (
                <div className="space-y-2">
                  {selectedQuestion.variants.map((v, i) => (
                    <div key={v.id || i} className="p-3 rounded-card border border-border bg-bg space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-heading font-bold text-ink">
                          {v.variant_type_display || v.variant_type}
                        </span>
                        <span className="font-mono text-forest font-semibold">{v.marks} Marks</span>
                      </div>
                      <p className="text-xs text-ink font-medium">{v.question_text}</p>
                      {v.options && Object.keys(v.options).length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 py-1 text-[11px]">
                          {Object.entries(v.options).map(([k, optVal]) => (
                            <div key={k} className="flex items-center gap-1.5 bg-surface rounded px-2 py-1 border border-border/40">
                              <span className="font-mono font-bold text-forest">{k}.</span>
                              <span className="truncate text-ink">{optVal as string}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[11px] text-ink/70 pt-1 border-t border-border/50">
                        <strong>Answer:</strong> {v.correct_answer}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* QUICK APPEND VARIANT MODAL                                               */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {quickVariantModalQuestion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-xs"
            onClick={() => setQuickVariantModalQuestion(null)}
          />
          <form
            onSubmit={handleQuickVariantSubmit}
            className="relative z-10 w-full max-w-lg bg-surface border border-border rounded-lg shadow-float p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-heading font-bold text-base text-ink">
                  Append Variant to Q#{quickVariantModalQuestion.id}
                </h3>
                <p className="text-xs text-forest font-semibold mt-0.5">
                  Locked Difficulty: {quickVariantModalQuestion.difficulty}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickVariantModalQuestion(null)}
                className="p-1 rounded-card border border-border bg-surface-muted text-ink/70 hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-heading font-semibold text-ink">Format</label>
                <CustomSelect
                  value={quickVariantType}
                  onChange={(val) => {
                    setQuickVariantType(val);
                    if (val === 'MCQ') {
                      if (!quickVariantAnswer || quickVariantAnswer.length > 1) {
                        setQuickVariantAnswer('A');
                      }
                    }
                  }}
                  options={[
                    { value: 'SHORT_ANSWER', label: 'Short Answer' },
                    { value: 'LONG_ANSWER', label: 'Long Answer' },
                    { value: 'MCQ', label: 'Multiple Choice' },
                    { value: 'FILL_IN_THE_BLANKS', label: 'Fill in the Blanks' },
                    { value: 'ONE_WORD', label: 'One Word' },
                  ]}
                  placeholder="Select format..."
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-heading font-semibold text-ink">Marks</label>
                <input
                  type="number"
                  step="0.5"
                  value={quickVariantMarks}
                  onChange={(e) => setQuickVariantMarks(e.target.value)}
                  className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs font-mono text-ink focus:border-forest focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-heading font-semibold text-ink">Variant Prompt *</label>
              <textarea
                rows={3}
                required
                value={quickVariantText}
                onChange={(e) => setQuickVariantText(e.target.value)}
                placeholder="Enter the alternate question text for this variant..."
                className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none"
              />
            </div>

            {/* Dynamic Options Builder for Quick MCQ Variant */}
            {quickVariantType === 'MCQ' && (
              <div className="bg-bg border border-border rounded-card p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-semibold text-xs text-ink">
                    Answer Choices / Options
                  </span>
                  {quickVariantOptions.length < 6 && (
                    <button
                      type="button"
                      onClick={addQuickVariantOption}
                      className="text-[11px] font-heading font-semibold text-forest hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Choice
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {quickVariantOptions.map((opt, optIdx) => (
                    <div key={opt.key} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-card bg-surface border border-border text-[11px] font-mono font-bold flex items-center justify-center text-ink shrink-0">
                        {opt.key}
                      </span>
                      <input
                        type="text"
                        required
                        placeholder={`Option ${opt.key} text`}
                        value={opt.text}
                        onChange={(e) => updateQuickVariantOption(optIdx, e.target.value)}
                        className="flex-1 rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                      />
                      {quickVariantOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeQuickVariantOption(optIdx)}
                          className="p-1 text-ink/40 hover:text-ember cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-heading font-semibold text-ink">Correct Answer *</label>
              {quickVariantType === 'MCQ' ? (
                <CustomSelect
                  value={quickVariantAnswer || 'A'}
                  onChange={(val) => setQuickVariantAnswer(val)}
                  options={quickVariantOptions.map((opt) => ({
                    value: opt.key,
                    label: `Option ${opt.key}${opt.text ? `: ${opt.text.substring(0, 24)}...` : ''}`,
                  }))}
                  placeholder="Select correct choice..."
                  className="w-full"
                />
              ) : (
                <input
                  type="text"
                  required
                  value={quickVariantAnswer}
                  onChange={(e) => setQuickVariantAnswer(e.target.value)}
                  placeholder="Correct answer or scoring criteria"
                  className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none"
                />
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-ink">Hint / Explanation</label>
              <input
                type="text"
                value={quickVariantExplanation}
                onChange={(e) => setQuickVariantExplanation(e.target.value)}
                placeholder="Optional explanation"
                className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none"
              />
            </div>

            <div className="border-t border-border pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickVariantModalQuestion(null)}
                className="px-3.5 py-1.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingQuickVariant}
                className="px-4 py-1.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingQuickVariant ? 'Saving Variant...' : 'Save Variant'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Validation Audit History Timeline Drawer */}
      <ValidationHistoryDrawer
        questionId={historyQuestionId}
        isOpen={historyQuestionId !== null}
        onClose={() => setHistoryQuestionId(null)}
      />
    </div>
  );
};

export const QBMDashboard: React.FC<QBMDashboardProps> = ({ initialTab }) => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') return <QBMDashboardMobile key="mobile" initialTab={initialTab} />;
  if (breakpoint === 'tablet') return <QBMDashboardTablet key="tablet" initialTab={initialTab} />;
  return <QBMDashboardDesktop key="desktop" initialTab={initialTab} />;
};
