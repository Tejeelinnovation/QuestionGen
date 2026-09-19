import React from 'react';
import { DEOSubmissionsView } from '../../../components/qbm/DEOSubmissionsView';
import { ValidatorQueueView } from '../../../components/qbm/ValidatorQueueView';
import { ValidationStatusBadge } from '../../../components/qbm/ValidationStatusBadge';
import { ValidationHistoryDrawer } from '../../../components/qbm/ValidationHistoryDrawer';
import { SearchableSubjectSelect } from '../../../components/ui/searchable-subject-select';
import { CustomSelect } from '../../../components/ui/custom-select';
import { Pagination } from '../../../components/ui/pagination';
import { SkeletonQuestionGrid, SkeletonMetricCards } from '../../../components/ui/skeleton';
import { getStaggerDelay, CARD_MOTION } from '../../../lib/motion';
import { useQBMDashboard } from '../../../hooks/useQBMDashboard';
import type { QBMDashboardProps } from '../../dashboards/QBMDashboard';
import {
  Database, Plus, Search, Layers, CheckCircle2, AlertCircle,
  ChevronRight, Sparkles, Trash2, X, FileQuestion, Inbox, History,
} from 'lucide-react';

export const QBMDashboardMobile: React.FC<QBMDashboardProps> = ({ initialTab }) => {
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
    selectedBookId, setSelectedBookId, isNewBook, setIsNewBook, newBookTitle, setNewBookTitle,
    newBookSubject, setNewBookSubject, newBookGrade, setNewBookGrade,
    selectedChapterId, setSelectedChapterId, isNewChapter, setIsNewChapter, newChapterTitle, setNewChapterTitle,
    selectedTopicId, setSelectedTopicId, selectedTopicIds, setSelectedTopicIds,
    isNewTopic, setIsNewTopic, newTopicName, setNewTopicName,
    difficulty, setDifficulty, learnerLevel, setLearnerLevel, questionType, setQuestionType,
    marks, setMarks, questionText, setQuestionText, sourceReference, setSourceReference,
    explanation, setExplanation,
    options, correctAnswer, setCorrectAnswer, handleOptionChange, addOption, removeOption,
    variants, addVariant, removeVariant, updateVariant, addVariantOption, removeVariantOption, updateVariantOption,
    isSubmitting, ingestSuccessMsg, setIngestSuccessMsg, ingestErrorMsg, handleIngestSubmit,
    quickVariantModalQuestion, setQuickVariantModalQuestion,
    quickVariantType, setQuickVariantType, quickVariantMarks, setQuickVariantMarks,
    quickVariantText, setQuickVariantText, quickVariantAnswer, setQuickVariantAnswer,
    quickVariantExplanation, setQuickVariantExplanation,
    quickVariantOptions, isSubmittingQuickVariant,
    addQuickVariantOption, removeQuickVariantOption, updateQuickVariantOption, handleQuickVariantSubmit,
  } = useQBMDashboard(initialTab);

  return (
    <div className="space-y-5 pb-20 px-1">
      {/* ── Compact Mobile Header ── */}
      <div className="pt-2 space-y-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-forest/10 border border-forest/20 text-[11px] font-semibold text-forest">
          <Sparkles className="w-3 h-3" />
          Question Bank Manager
        </div>
        <h1 className="font-heading font-bold text-2xl text-ink tracking-tight leading-tight">
          {isDEO ? 'Data Entry Workspace' : isValidator ? 'Validator Workspace' : 'Curriculum Engine'}
        </h1>
      </div>

      {/* ── Stats 2×2 Grid ── */}
      {!stats ? (
        <SkeletonMetricCards count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded-card p-3 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Repository</span>
            <div className="font-heading font-bold text-xl text-ink mt-0.5">{stats.total_questions ?? 0}</div>
            <p className="text-[10px] text-forest font-medium">Questions</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-3 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">With Variants</span>
            <div className="font-heading font-bold text-xl text-forest mt-0.5">{stats.with_variants ?? 0}</div>
            <p className="text-[10px] text-ink/60">Multi-format</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-3 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Boards</span>
            <div className="font-heading font-bold text-xl text-ink mt-0.5">{stats.boards_count ?? boards.length}</div>
            <p className="text-[10px] text-ink/60">Curriculum</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-3 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Chapters</span>
            <div className="font-heading font-bold text-xl text-ink mt-0.5">{stats.active_chapters ?? chapters.length}</div>
            <p className="text-[10px] text-ink/60">Active</p>
          </div>
        </div>
      )}

      {/* ── Tab Switcher (2×2 grid) ── */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-surface-muted border border-border rounded-xl shadow-xs">
        {(isQBM || (!isDEO && !isValidator)) && (
          <button type="button" onClick={() => setActiveTab('explore')}
            className={`px-3 py-2.5 text-xs font-heading font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'explore' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
            <Database className="w-3.5 h-3.5 shrink-0" /><span>Explorer</span>
          </button>
        )}
        {(isQBM || isDEO || (!isDEO && !isValidator)) && (
          <button type="button" onClick={() => setActiveTab('ingest')}
            className={`px-3 py-2.5 text-xs font-heading font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'ingest' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
            <Plus className="w-3.5 h-3.5 shrink-0" /><span>{isDEO ? 'Enter Q' : 'Ingest Q'}</span>
          </button>
        )}
        {(isDEO || isQBM) && (
          <button type="button" onClick={() => setActiveTab('submissions')}
            className={`px-3 py-2.5 text-xs font-heading font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'submissions' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
            <FileQuestion className="w-3.5 h-3.5 shrink-0" /><span>Submissions</span>
          </button>
        )}
        {(isValidator || isQBM) && (
          <button type="button" onClick={() => setActiveTab('validation')}
            className={`px-3 py-2.5 text-xs font-heading font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'validation' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
            <Inbox className="w-3.5 h-3.5 shrink-0" /><span>Review</span>
          </button>
        )}
      </div>

      {/* ════════════════════════════════ */}
      {/* TAB 1: EXPLORER                  */}
      {/* ════════════════════════════════ */}
      {activeTab === 'explore' && (
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search questions..."
                className="w-full pl-9 pr-9 py-2.5 rounded-pill border border-border bg-bg text-xs font-body text-ink focus:outline-none focus:border-forest"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer p-0.5"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-2">
              <CustomSelect id="qbm-m-board" value={filterBoard} onChange={handleBoardChange}
                options={[{ value: 'ALL', label: 'All Boards' }, ...boards.map((b) => ({ value: b, label: b }))]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-full" />
              <CustomSelect id="qbm-m-type" value={filterType} onChange={handleTypeChange}
                options={[{ value: 'ALL', label: 'All Question Types' }, { value: 'MCQ', label: 'Multiple Choice (MCQ)' }, { value: 'MSQ', label: 'Multiple Select (MSQ)' }, { value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill in Blanks' }, { value: 'ONE_WORD', label: 'One Word' }, { value: 'MATCH_THE_FOLLOWING', label: 'Match the Following' }]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-full" />
              <div className="grid grid-cols-2 gap-2">
                <CustomSelect id="qbm-m-diff" value={filterDifficulty} onChange={handleDifficultyChange}
                  options={[{ value: 'ALL', label: 'All Difficulties' }, { value: 'EASY', label: 'Easy' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HARD', label: 'Hard' }]}
                  triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-full" />
                <CustomSelect id="qbm-m-sort" value={sortBy} onChange={handleSortChange}
                  options={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'marks_desc', label: 'Marks ↓' }, { value: 'marks_asc', label: 'Marks ↑' }]}
                  triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-full" />
              </div>
            </div>

            {/* Active Filters Bar */}
            {(searchTerm.trim() || filterBoard !== 'ALL' || filterType !== 'ALL' || filterDifficulty !== 'ALL') && (
              <div className="flex flex-wrap items-center gap-1.5 px-0.5 text-[11px]">
                <span className="text-ink/60 font-medium">Active:</span>
                {searchTerm.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-surface border border-border text-ink font-medium shadow-2xs">
                    "{searchTerm}"
                    <button type="button" onClick={() => setSearchTerm('')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterBoard !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-forest/10 border border-forest/20 text-forest font-medium shadow-2xs">
                    {filterBoard}
                    <button type="button" onClick={() => handleBoardChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterType !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-forest/10 border border-forest/20 text-forest font-medium shadow-2xs">
                    {filterType}
                    <button type="button" onClick={() => handleTypeChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterDifficulty !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-amber-50 border border-amber-200 text-amber-800 font-medium shadow-2xs">
                    {filterDifficulty}
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
                  className="text-[11px] font-semibold text-forest hover:underline cursor-pointer ml-1"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {isLoadingQuestions ? (
            <SkeletonQuestionGrid count={3} />
          ) : questions.length === 0 ? (
            <div className="bg-surface border-2 border-dashed border-border rounded-card p-8 text-center space-y-3 shadow-card">
              <span className="pill pill-forest text-[10px]">Repository Ready</span>
              <FileQuestion className="w-8 h-8 text-ink/30 mx-auto" />
              <h3 className="font-heading font-semibold text-ink text-sm">No Questions Found</h3>
              <button type="button" onClick={() => setActiveTab('ingest')} className="mt-2 px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white inline-flex items-center gap-1.5 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Ingest Question
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={getStaggerDelay(idx, true)}
                    onClick={() => setSelectedQuestion(q)}
                    className={`bg-surface border border-border hover:border-forest/50 transition-all rounded-card p-4 shadow-card cursor-pointer ${CARD_MOTION.touchCard}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <ValidationStatusBadge status={q.validation_status} revision={q.revision} />
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-forest/10 text-forest border border-forest/20">{q.question_type_display || q.question_type}</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-pill bg-surface-muted text-ink/70 border border-border">{q.marks}m</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded-pill ${q.difficulty === 'EASY' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : q.difficulty === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{q.difficulty}</span>
                    </div>
                    <p className="text-xs text-ink font-medium line-clamp-2 leading-relaxed mb-2">{q.question_text}</p>
                    <div className="flex items-center justify-between text-[11px] text-ink/60 pt-2 border-t border-border/60">
                      <span className="truncate max-w-[200px]">{q.topic_name || 'General Topic'}</span>
                      <span className="font-heading font-semibold text-forest flex items-center gap-0.5">Details <ChevronRight className="w-3 h-3" /></span>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination currentPage={currentPage} totalCount={totalCount} pageSize={pageSize}
                onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                pageSizeOptions={[10, 20, 50]} itemName="questions" />
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* TAB 2: INGEST FORM               */}
      {/* ════════════════════════════════ */}
      {activeTab === 'ingest' && (
        <form onSubmit={handleIngestSubmit} className="space-y-6">
          {ingestSuccessMsg && (
            <div className="p-3 rounded-card bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start justify-between gap-2">
              <div className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /><span>{ingestSuccessMsg}</span></div>
              <button type="button" onClick={() => setIngestSuccessMsg(null)} className="cursor-pointer shrink-0"><X className="w-3.5 h-3.5 text-emerald-600" /></button>
            </div>
          )}
          {ingestErrorMsg && (
            <div className="p-3 rounded-card bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" /><span>{ingestErrorMsg}</span>
            </div>
          )}

          {/* Step 1: Hierarchy */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
              <h2 className="font-heading font-bold text-xs text-ink uppercase tracking-wider">Curriculum Hierarchy</h2>
            </div>

            {/* Board */}
            <div className="p-3 rounded-card bg-surface border border-border space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="font-heading text-xs font-bold text-ink">Board *</label>
                {!isNewBoard ? (
                  <button type="button" onClick={() => { setIsNewBoard(true); setSelectedBoard(''); }} className="text-[11px] text-forest font-semibold cursor-pointer">+ New Board</button>
                ) : (
                  <button type="button" onClick={() => { setIsNewBoard(false); if (boards.length > 0) setSelectedBoard(boards[0]); }} className="text-[11px] text-ink/60 cursor-pointer">← Existing</button>
                )}
              </div>
              {!isNewBoard ? (
                <CustomSelect value={selectedBoard} onChange={(val) => { if (val === '__NEW__') { setIsNewBoard(true); setSelectedBoard(''); } else setSelectedBoard(val); }}
                  options={[...boards.map((b) => ({ value: b, label: b })), { value: '__NEW__', label: '+ Add New Board...', badge: 'NEW' }]} placeholder="Select board..." className="w-full" />
              ) : (
                <input type="text" value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="e.g. Cambridge IGCSE" className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none" required autoFocus />
              )}
            </div>

            {/* Book */}
            <div className="p-3 rounded-card bg-surface border border-border space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="font-heading text-xs font-bold text-ink">Book / Curriculum *</label>
                {!isNewBook ? (
                  <button type="button" onClick={() => { setIsNewBook(true); setSelectedBookId('NEW'); }} className="text-[11px] text-forest font-semibold cursor-pointer">+ New Book</button>
                ) : books.length > 0 && !isNewBoard ? (
                  <button type="button" onClick={() => { setIsNewBook(false); setSelectedBookId(books[0].id); }} className="text-[11px] text-ink/60 cursor-pointer">← Existing ({books.length})</button>
                ) : null}
              </div>
              {!isNewBook && books.length > 0 ? (
                <CustomSelect value={String(selectedBookId)}
                  onChange={(val) => { if (val === '__NEW__') { setIsNewBook(true); setSelectedBookId('NEW'); } else setSelectedBookId(Number(val)); }}
                  options={[...books.map((bk) => ({ value: String(bk.id), label: `${bk.title} (${bk.grade})` })), { value: '__NEW__', label: '+ Add New Book...', badge: 'NEW' }]}
                  placeholder="Select book..." className="w-full" />
              ) : (
                <div className="space-y-2">
                  <SearchableSubjectSelect value={newBookSubject} onChange={setNewBookSubject} placeholder="Subject (e.g. Mathematics)..." required={isNewBook} />
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect value={newBookGrade} onChange={setNewBookGrade}
                      options={['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12']}
                      placeholder="Grade..." className="w-full" />
                    <input type="text" value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)} placeholder="Title (opt.)" className="w-full rounded-card border border-border bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Chapter */}
            <div className="p-3 rounded-card bg-surface border border-border space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="font-heading text-xs font-bold text-ink">Chapter *</label>
                {!isNewChapter ? (
                  <button type="button" onClick={() => { setIsNewChapter(true); setSelectedChapterId('NEW'); }} className="text-[11px] text-forest font-semibold cursor-pointer">+ New Chapter</button>
                ) : chapters.length > 0 && !isNewBook ? (
                  <button type="button" onClick={() => { setIsNewChapter(false); setSelectedChapterId(chapters[0].id); }} className="text-[11px] text-ink/60 cursor-pointer">← Existing ({chapters.length})</button>
                ) : null}
              </div>
              {!isNewChapter && chapters.length > 0 ? (
                <CustomSelect value={String(selectedChapterId)}
                  onChange={(val) => { if (val === '__NEW__') { setIsNewChapter(true); setSelectedChapterId('NEW'); } else setSelectedChapterId(Number(val)); }}
                  options={[...chapters.map((ch) => ({ value: String(ch.id), label: `Ch.${ch.chapter_order}: ${ch.title}` })), { value: '__NEW__', label: '+ Add New Chapter...', badge: 'NEW' }]}
                  placeholder="Select chapter..." className="w-full" />
              ) : (
                <input type="text" value={newChapterTitle} onChange={(e) => setNewChapterTitle(e.target.value)} placeholder="e.g. Ch. 1: Quadratic Equations" className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none" required={isNewChapter} />
              )}
            </div>

            {/* Topic */}
            <div className="p-3 rounded-card bg-surface border border-border space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="font-heading text-xs font-bold text-ink">Topic *</label>
                {!isNewTopic ? (
                  <button type="button" onClick={() => { setIsNewTopic(true); setSelectedTopicId('NEW'); }} className="text-[11px] text-forest font-semibold cursor-pointer">+ New Topic</button>
                ) : topics.length > 0 && !isNewChapter ? (
                  <button type="button" onClick={() => { setIsNewTopic(false); setSelectedTopicId(topics[0].id); }} className="text-[11px] text-ink/60 cursor-pointer">← Existing ({topics.length})</button>
                ) : null}
              </div>
              {!isNewTopic && topics.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-bg rounded-card border border-border">
                    {selectedTopicIds.length === 0 && <span className="text-[11px] text-ink/40 font-mono">No topics selected.</span>}
                    {selectedTopicIds.map((tId) => {
                      const tObj = topics.find((tp) => tp.id === tId);
                      return (
                        <span key={tId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] bg-surface border border-border text-ink font-medium">
                          <span>{tObj ? tObj.name : `Topic #${tId}`}</span>
                          <button type="button" onClick={() => { const next = selectedTopicIds.filter((id) => id !== tId); setSelectedTopicIds(next); if (next.length > 0) setSelectedTopicId(next[0]); }} className="text-ink/40 hover:text-ink cursor-pointer"><X className="w-3 h-3" /></button>
                        </span>
                      );
                    })}
                  </div>
                  <CustomSelect value=""
                    onChange={(val) => { if (val === '__NEW__') { setIsNewTopic(true); setSelectedTopicId('NEW'); } else if (val) { const n = Number(val); if (!selectedTopicIds.includes(n)) { const next = [...selectedTopicIds, n]; setSelectedTopicIds(next); setSelectedTopicId(next[0]); } } }}
                    options={[...topics.map((tp) => ({ value: String(tp.id), label: `${tp.name}${selectedTopicIds.includes(tp.id) ? ' ✓' : ''}` })), { value: '__NEW__', label: '+ Create New Topic...', badge: 'NEW' }]}
                    placeholder="+ Add Topic..." className="w-full" />
                </div>
              ) : (
                <input type="text" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="e.g. Nature of Roots" className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none" required={isNewTopic} />
              )}
            </div>
          </section>

          {/* Step 2: Difficulty & Marks */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
              <h2 className="font-heading font-bold text-xs text-ink uppercase tracking-wider">Difficulty & Marks</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
                <button key={diff} type="button" onClick={() => setDifficulty(diff)}
                  className={`py-2 text-xs font-heading font-semibold rounded-card border transition-all cursor-pointer ${difficulty === diff ? 'border-forest bg-forest text-white' : 'border-border bg-bg text-ink'}`}>
                  {diff}
                </button>
              ))}
            </div>
            <CustomSelect value={learnerLevel} onChange={(val) => setLearnerLevel(val as any)}
              options={[{ value: 'BEGINNER', label: 'Beginner (Foundational)' }, { value: 'INTERMEDIATE', label: 'Intermediate (Competency)' }, { value: 'ADVANCED', label: 'Advanced (HOTS)' }]}
              placeholder="Learner level..." className="w-full" />
            <div className="space-y-1">
              <label className="block font-heading text-xs font-semibold text-ink">Primary Marks *</label>
              <input type="number" step="0.5" min="0.5" max="100" value={marks} onChange={(e) => setMarks(e.target.value)} className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none font-mono" />
            </div>
          </section>

          {/* Step 3: Question Content */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
              <h2 className="font-heading font-bold text-xs text-ink uppercase tracking-wider">Question Content</h2>
            </div>
            <CustomSelect value={questionType} onChange={setQuestionType}
              options={[{ value: 'MCQ', label: 'Multiple Choice (MCQ)' }, { value: 'MSQ', label: 'Multiple Select (MSQ)' }, { value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill in Blanks' }, { value: 'ONE_WORD', label: 'One Word' }, { value: 'MATCH_THE_FOLLOWING', label: 'Match the Following' }]}
              placeholder="Question type..." className="w-full" />
            <div className="space-y-1.5">
              <label className="block font-heading text-xs font-semibold text-ink">Question Statement *</label>
              <textarea rows={4} required value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Enter the question statement..." className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none leading-relaxed" />
            </div>
            {['MCQ', 'MSQ', 'MATCH_THE_FOLLOWING'].includes(questionType) && (
              <div className="bg-bg border border-border rounded-card p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-semibold text-xs text-ink">Answer Choices</span>
                  {options.length < 6 && <button type="button" onClick={addOption} className="text-[11px] font-semibold text-forest cursor-pointer flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>}
                </div>
                {options.map((opt, idx) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-card bg-surface border border-border text-[11px] font-mono font-bold flex items-center justify-center text-ink shrink-0">{opt.key}</span>
                    <input type="text" required placeholder={`Option ${opt.key}`} value={opt.text} onChange={(e) => handleOptionChange(idx, e.target.value)} className="flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none" />
                    {options.length > 2 && <button type="button" onClick={() => removeOption(idx)} className="p-1 text-ink/40 hover:text-ember cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block font-heading text-xs font-semibold text-ink">Correct Answer *</label>
              {questionType === 'MCQ' ? (
                <CustomSelect value={correctAnswer} onChange={setCorrectAnswer}
                  options={options.map((opt) => ({ value: opt.key, label: `Option ${opt.key}${opt.text ? ': ' + opt.text.substring(0, 20) : ''}` }))}
                  placeholder="Select correct..." className="w-full" />
              ) : (
                <textarea rows={2} required value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="Correct answer / rubric..." className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none" />
              )}
            </div>
            <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Pedagogical explanation (optional)..." className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none" />
            <input type="text" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="Source reference (optional)" className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none" />
          </section>

          {/* Step 4: Variants */}
          <section className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center shrink-0">4</span>
                <h2 className="font-heading font-bold text-xs text-ink uppercase tracking-wider">Variants</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => addVariant('2.00', 'SHORT_ANSWER')} className="px-2 py-1 text-[10px] font-heading font-semibold rounded-pill bg-forest/10 border border-forest/20 text-forest cursor-pointer">+2m</button>
                <button type="button" onClick={() => addVariant('3.00', 'SHORT_ANSWER')} className="px-2 py-1 text-[10px] font-heading font-semibold rounded-pill bg-amber-50 border border-amber-200 text-amber-800 cursor-pointer">+3m</button>
                <button type="button" onClick={() => addVariant('5.00', 'LONG_ANSWER')} className="px-2 py-1 text-[10px] font-heading font-semibold rounded-pill bg-grape/10 border border-grape/20 text-grape cursor-pointer">+5m</button>
              </div>
            </div>
            {variants.length === 0 ? (
              <div className="border border-dashed border-border rounded-card p-5 text-center text-xs text-ink/60">
                <Layers className="w-5 h-5 text-ink/30 mx-auto mb-1" />
                <p>Tap +2m / +3m / +5m to add variants.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {variants.map((v, idx) => (
                  <div key={idx} className="bg-bg border border-border rounded-card p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-xs text-ink">Variant #{idx + 1} — {v.marks}m</span>
                      <button type="button" onClick={() => removeVariant(idx)} className="text-ink/40 hover:text-rose-600 p-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <CustomSelect value={v.variant_type} onChange={(val) => updateVariant(idx, 'variant_type', val)}
                        options={[{ value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'MCQ', label: 'MCQ' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill Blanks' }, { value: 'ONE_WORD', label: 'One Word' }]}
                        placeholder="Format..." className="w-full" />
                      <input type="number" step="0.5" value={v.marks} onChange={(e) => updateVariant(idx, 'marks', e.target.value)} className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink font-mono focus:border-forest focus:outline-none" />
                    </div>
                    <textarea rows={2} required value={v.question_text} onChange={(e) => updateVariant(idx, 'question_text', e.target.value)} placeholder="Variant question text..." className="w-full rounded-card border border-border bg-surface p-2.5 text-xs text-ink focus:border-forest focus:outline-none" />
                    {v.variant_type === 'MCQ' && (
                      <div className="space-y-1.5">
                        {(v.options || []).map((opt, optIdx) => (
                          <div key={opt.key} className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center text-ink bg-surface-muted border border-border shrink-0">{opt.key}</span>
                            <input type="text" required value={opt.text} onChange={(e) => updateVariantOption(idx, optIdx, e.target.value)} placeholder={`Option ${opt.key}`} className="flex-1 rounded-card border border-border bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none" />
                            {(v.options?.length || 0) > 2 && <button type="button" onClick={() => removeVariantOption(idx, optIdx)} className="text-ink/40 cursor-pointer"><X className="w-3 h-3" /></button>}
                          </div>
                        ))}
                        {(v.options?.length || 0) < 6 && <button type="button" onClick={() => addVariantOption(idx)} className="text-[11px] text-forest font-semibold flex items-center gap-1 cursor-pointer"><Plus className="w-3 h-3" /> Add Choice</button>}
                      </div>
                    )}
                    {v.variant_type === 'MCQ' ? (
                      <CustomSelect value={v.correct_answer || 'A'} onChange={(val) => updateVariant(idx, 'correct_answer', val)}
                        options={(v.options || []).map((opt) => ({ value: opt.key, label: `Option ${opt.key}` }))} placeholder="Correct..." className="w-full" />
                    ) : (
                      <input type="text" required value={v.correct_answer} onChange={(e) => updateVariant(idx, 'correct_answer', e.target.value)} placeholder="Correct answer" className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none" />
                    )}
                    <input type="text" value={v.explanation} onChange={(e) => updateVariant(idx, 'explanation', e.target.value)} placeholder="Hint / Explanation (optional)" className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sticky Submit Bar */}
          <div className="sticky bottom-0 -mx-1 px-4 py-3 bg-bg border-t border-border flex items-center gap-3">
            <button type="button" onClick={() => setActiveTab('explore')} className="flex-1 py-2.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink cursor-pointer">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
              {isSubmitting ? 'Ingesting...' : <><CheckCircle2 className="w-4 h-4" /> Ingest + {variants.length} Variants</>}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: Submissions */}
      {activeTab === 'submissions' && <DEOSubmissionsView onNewQuestionClick={() => setActiveTab('ingest')} />}

      {/* TAB 4: Validation */}
      {activeTab === 'validation' && <ValidatorQueueView />}

      {/* ── Question Detail — full-screen on mobile ── */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg overflow-y-auto">
          <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <ValidationStatusBadge status={selectedQuestion.validation_status} revision={selectedQuestion.revision} />
              <span className="font-heading font-bold text-sm text-ink">Q#{selectedQuestion.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setHistoryQuestionId(selectedQuestion.id)} className="px-2 py-1 rounded-pill bg-surface-muted border border-border text-xs font-mono text-ink/80 flex items-center gap-1 cursor-pointer">
                <History className="w-3 h-3 text-forest" /> History
              </button>
              <button type="button" onClick={() => setSelectedQuestion(null)} className="p-1.5 rounded-card border border-border bg-surface-muted text-ink/70 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-forest/10 text-forest border border-forest/20">{selectedQuestion.question_type_display || selectedQuestion.question_type}</span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded-pill bg-surface-muted text-ink/70 border border-border">{selectedQuestion.marks} Marks</span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded-pill bg-surface-muted text-ink/70 border border-border">{selectedQuestion.difficulty}</span>
            </div>
            <p className="text-[11px] font-mono text-ink/60">By: <strong className="text-ink">{selectedQuestion.created_by_name || 'System'}</strong> • {selectedQuestion.school_name || 'Global'}</p>
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Question</span>
              <p className="text-xs text-ink font-medium leading-relaxed bg-bg p-3 rounded-card border border-border">{selectedQuestion.question_text}</p>
            </div>
            {selectedQuestion.options && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Choices</span>
                <div className="space-y-1.5">
                  {Object.entries(selectedQuestion.options).map(([k, v]) => (
                    <div key={k} className={`p-2 rounded-card text-xs border flex items-center gap-2 ${selectedQuestion.correct_answer === k ? 'border-forest bg-forest/5 text-forest font-semibold' : 'border-border bg-surface text-ink'}`}>
                      <span className="w-5 h-5 rounded-full bg-surface-muted border border-border text-[10px] font-mono font-bold flex items-center justify-center shrink-0">{k}</span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Correct Answer</span>
              <div className="p-2.5 rounded-card border border-border bg-bg text-xs font-mono font-bold text-forest">{selectedQuestion.correct_answer}</div>
            </div>
            {selectedQuestion.explanation && (
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-ink/50 uppercase tracking-wider">Explanation</span>
                <p className="p-2.5 rounded-card border border-border bg-bg text-xs text-ink/80 leading-relaxed">{selectedQuestion.explanation}</p>
              </div>
            )}
            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-xs text-ink uppercase tracking-wider">Variants ({selectedQuestion.variants?.length || 0})</span>
                <button type="button" onClick={() => setQuickVariantModalQuestion(selectedQuestion)} className="px-2.5 py-1 text-xs font-heading font-semibold rounded-pill bg-forest/10 border border-forest/20 text-forest cursor-pointer flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
              </div>
              {(!selectedQuestion.variants || selectedQuestion.variants.length === 0) ? (
                <p className="text-xs text-ink/50 italic">No variants yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedQuestion.variants.map((v, i) => (
                    <div key={v.id || i} className="p-3 rounded-card border border-border bg-bg space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-heading font-bold text-ink">{v.variant_type_display || v.variant_type}</span>
                        <span className="font-mono text-forest font-semibold">{v.marks}m</span>
                      </div>
                      <p className="text-xs text-ink font-medium">{v.question_text}</p>
                      <div className="text-[11px] text-ink/70 pt-1 border-t border-border/50"><strong>Answer:</strong> {v.correct_answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Variant Modal — bottom sheet on mobile ── */}
      {quickVariantModalQuestion && (
        <div className="fixed inset-0 z-60 flex items-end justify-center">
          <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs" onClick={() => setQuickVariantModalQuestion(null)} />
          <form onSubmit={handleQuickVariantSubmit} className="relative z-10 w-full bg-surface border-t border-border rounded-t-2xl shadow-float p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-heading font-bold text-sm text-ink">Add Variant to Q#{quickVariantModalQuestion.id}</h3>
                <p className="text-xs text-forest font-semibold mt-0.5">Locked: {quickVariantModalQuestion.difficulty}</p>
              </div>
              <button type="button" onClick={() => setQuickVariantModalQuestion(null)} className="p-1 rounded-card border border-border bg-surface-muted text-ink/70 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CustomSelect value={quickVariantType}
                onChange={(val) => { setQuickVariantType(val); if (val === 'MCQ' && (!quickVariantAnswer || quickVariantAnswer.length > 1)) setQuickVariantAnswer('A'); }}
                options={[{ value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'MCQ', label: 'Multiple Choice' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill Blanks' }, { value: 'ONE_WORD', label: 'One Word' }]}
                placeholder="Format..." className="w-full" />
              <input type="number" step="0.5" value={quickVariantMarks} onChange={(e) => setQuickVariantMarks(e.target.value)} className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs font-mono text-ink focus:border-forest focus:outline-none" />
            </div>
            <textarea rows={3} required value={quickVariantText} onChange={(e) => setQuickVariantText(e.target.value)} placeholder="Variant question text..." className="w-full rounded-card border border-border bg-bg p-3 text-xs text-ink focus:border-forest focus:outline-none" />
            {quickVariantType === 'MCQ' && (
              <div className="space-y-1.5">
                {quickVariantOptions.map((opt, optIdx) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center text-ink bg-surface-muted border border-border shrink-0">{opt.key}</span>
                    <input type="text" required value={opt.text} onChange={(e) => updateQuickVariantOption(optIdx, e.target.value)} placeholder={`Option ${opt.key}`} className="flex-1 rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none" />
                    {quickVariantOptions.length > 2 && <button type="button" onClick={() => removeQuickVariantOption(optIdx)} className="text-ink/40 cursor-pointer"><X className="w-3 h-3" /></button>}
                  </div>
                ))}
                {quickVariantOptions.length < 6 && <button type="button" onClick={addQuickVariantOption} className="text-[11px] text-forest font-semibold flex items-center gap-1 cursor-pointer"><Plus className="w-3 h-3" /> Add</button>}
              </div>
            )}
            {quickVariantType === 'MCQ' ? (
              <CustomSelect value={quickVariantAnswer || 'A'} onChange={setQuickVariantAnswer}
                options={quickVariantOptions.map((opt) => ({ value: opt.key, label: `Option ${opt.key}` }))} placeholder="Correct..." className="w-full" />
            ) : (
              <input type="text" required value={quickVariantAnswer} onChange={(e) => setQuickVariantAnswer(e.target.value)} placeholder="Correct answer..." className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none" />
            )}
            <input type="text" value={quickVariantExplanation} onChange={(e) => setQuickVariantExplanation(e.target.value)} placeholder="Hint / Explanation (optional)" className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none" />
            <div className="flex items-center gap-2 pt-2">
              <button type="button" onClick={() => setQuickVariantModalQuestion(null)} className="flex-1 py-2.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmittingQuickVariant} className="flex-1 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white cursor-pointer disabled:opacity-50">
                {isSubmittingQuickVariant ? 'Saving...' : 'Save Variant'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Validation History Drawer */}
      <ValidationHistoryDrawer questionId={historyQuestionId} isOpen={historyQuestionId !== null} onClose={() => setHistoryQuestionId(null)} />
    </div>
  );
};
