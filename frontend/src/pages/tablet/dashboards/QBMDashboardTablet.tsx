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

export const QBMDashboardTablet: React.FC<QBMDashboardProps> = ({ initialTab }) => {
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
    <div className="space-y-6 max-w-5xl mx-auto pb-16 px-2">
      {/* ── Header ── */}
      <div className="border-b border-border pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-forest/10 border border-forest/20 text-xs font-semibold text-forest">
            <Sparkles className="w-3.5 h-3.5" />
            {isDEO ? 'DEO Workspace' : isValidator ? 'Validator Workspace' : 'Central Question Bank Manager'}
          </div>
          <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
            {isDEO ? 'Data Entry Interface' : isValidator ? 'Validation Queue' : 'Curriculum Ingestion Engine'}
          </h1>
        </div>

        {/* Horizontal Tab Switcher */}
        <div className="flex flex-nowrap items-center gap-1.5 p-1.5 bg-surface-muted border border-border rounded-pill shadow-xs shrink-0">
          {(isQBM || (!isDEO && !isValidator)) && (
            <button type="button" onClick={() => setActiveTab('explore')}
              className={`px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'explore' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
              <Database className="w-3.5 h-3.5" /> Explorer
            </button>
          )}
          {(isQBM || isDEO || (!isDEO && !isValidator)) && (
            <button type="button" onClick={() => setActiveTab('ingest')}
              className={`px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'ingest' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
              <Plus className="w-3.5 h-3.5" /> {isDEO ? 'Enter Question' : 'Ingest Question'}
            </button>
          )}
          {(isDEO || isQBM) && (
            <button type="button" onClick={() => setActiveTab('submissions')}
              className={`px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'submissions' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
              <FileQuestion className="w-3.5 h-3.5" /> Submissions
            </button>
          )}
          {(isValidator || isQBM) && (
            <button type="button" onClick={() => setActiveTab('validation')}
              className={`px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'validation' ? 'bg-forest text-white shadow-xs' : 'text-ink/70 hover:text-ink hover:bg-surface/60'}`}>
              <Inbox className="w-3.5 h-3.5" /> Review Queue
            </button>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      {!stats ? (
        <SkeletonMetricCards count={4} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Repository</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">{stats.total_questions ?? 0}</div>
            <p className="text-xs text-forest font-medium">Total Questions</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Multi-Format</span>
            <div className="font-heading font-bold text-2xl text-forest mt-1">{stats.with_variants ?? 0}</div>
            <p className="text-xs text-ink/60">With Variants</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Curriculum</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">{stats.boards_count ?? boards.length}</div>
            <p className="text-xs text-ink/60">Boards</p>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="text-[10px] font-mono text-ink/60 uppercase tracking-wider">Active Chapters</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">{stats.active_chapters ?? chapters.length}</div>
            <p className="text-xs text-ink/60">Chapters</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 1: EXPLORER                          */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'explore' && (
        <div className="space-y-5">
          {/* Filters: search full-width + row of dropdowns */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-ink/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search questions by text, topic, or board..."
                className="w-full pl-10 pr-9 py-2.5 rounded-pill border border-border bg-bg text-sm font-body text-ink focus:outline-none focus:border-forest"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer p-0.5"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CustomSelect id="qbm-t-board" value={filterBoard} onChange={handleBoardChange}
                options={[{ value: 'ALL', label: 'All Boards' }, ...boards.map((b) => ({ value: b, label: b }))]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-auto" />
              <CustomSelect id="qbm-t-type" value={filterType} onChange={handleTypeChange}
                options={[{ value: 'ALL', label: 'All Types' }, { value: 'MCQ', label: 'MCQ' }, { value: 'MSQ', label: 'MSQ' }, { value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill Blanks' }, { value: 'ONE_WORD', label: 'One Word' }, { value: 'MATCH_THE_FOLLOWING', label: 'Match Following' }]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-auto" />
              <CustomSelect id="qbm-t-diff" value={filterDifficulty} onChange={handleDifficultyChange}
                options={[{ value: 'ALL', label: 'All Difficulties' }, { value: 'EASY', label: 'Easy' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HARD', label: 'Hard' }]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-auto" />
              <CustomSelect id="qbm-t-sort" value={sortBy} onChange={handleSortChange}
                options={[{ value: 'newest', label: 'Newest First' }, { value: 'oldest', label: 'Oldest First' }, { value: 'marks_desc', label: 'Marks: High→Low' }, { value: 'marks_asc', label: 'Marks: Low→High' }]}
                triggerClassName="rounded-pill text-xs py-2 px-3 bg-bg" className="w-auto" />
            </div>

            {/* Active Filters Bar */}
            {(searchTerm.trim() || filterBoard !== 'ALL' || filterType !== 'ALL' || filterDifficulty !== 'ALL') && (
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                <span className="text-ink/60 font-medium">Active:</span>
                {searchTerm.trim() && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-surface border border-border text-ink font-medium shadow-2xs">
                    Search: "{searchTerm}"
                    <button type="button" onClick={() => setSearchTerm('')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterBoard !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-forest/10 border border-forest/20 text-forest font-medium shadow-2xs">
                    {filterBoard}
                    <button type="button" onClick={() => handleBoardChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterType !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-forest/10 border border-forest/20 text-forest font-medium shadow-2xs">
                    {filterType}
                    <button type="button" onClick={() => handleTypeChange('ALL')} className="hover:text-ember cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filterDifficulty !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-amber-50 border border-amber-200 text-amber-800 font-medium shadow-2xs">
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
                  className="text-xs font-semibold text-forest hover:underline cursor-pointer ml-1"
                >
                  Reset all
                </button>
              </div>
            )}
          </div>

          {isLoadingQuestions ? (
            <SkeletonQuestionGrid count={4} />
          ) : questions.length === 0 ? (
            <div className="bg-surface border-2 border-dashed border-border rounded-card p-10 text-center space-y-3 shadow-card">
              <span className="pill pill-forest text-xs">Repository Ready</span>
              <FileQuestion className="w-10 h-10 text-ink/30 mx-auto" />
              <h3 className="font-heading font-semibold text-ink">No Questions Found</h3>
              <button type="button" onClick={() => setActiveTab('ingest')} className="mt-2 px-4 py-2 text-sm font-heading font-semibold rounded-pill bg-forest text-white inline-flex items-center gap-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /> Ingest First Question
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 2-column grid on tablet */}
              <div className="grid grid-cols-2 gap-4">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={getStaggerDelay(idx)}
                    onClick={() => setSelectedQuestion(q)}
                    className={`bg-surface border border-border hover:border-forest/50 transition-all rounded-card p-4 shadow-card cursor-pointer flex flex-col gap-2 ${CARD_MOTION.interactive}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ValidationStatusBadge status={q.validation_status} revision={q.revision} />
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-pill bg-forest/10 text-forest border border-forest/20">{q.question_type_display || q.question_type}</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-pill bg-surface-muted text-ink/70 border border-border">{q.marks}m</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded-pill ${q.difficulty === 'EASY' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : q.difficulty === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{q.difficulty}</span>
                    </div>
                    <p className="text-xs text-ink font-medium line-clamp-3 leading-relaxed flex-1">{q.question_text}</p>
                    <div className="flex items-center justify-between text-[11px] text-ink/60 pt-2 border-t border-border/60 mt-auto">
                      <span className="truncate">{q.topic_name || 'General Topic'}</span>
                      <span className="font-heading font-semibold text-forest flex items-center gap-0.5 shrink-0">View <ChevronRight className="w-3 h-3" /></span>
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

      {/* ════════════════════════════════════════ */}
      {/* TAB 2: INGEST FORM                       */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'ingest' && (
        <form onSubmit={handleIngestSubmit} className="space-y-8">
          {ingestSuccessMsg && (
            <div className="p-4 rounded-card bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /><span>{ingestSuccessMsg}</span></div>
              <button type="button" onClick={() => setIngestSuccessMsg(null)} className="cursor-pointer shrink-0"><X className="w-4 h-4 text-emerald-600" /></button>
            </div>
          )}
          {ingestErrorMsg && (
            <div className="p-4 rounded-card bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" /><span>{ingestErrorMsg}</span>
            </div>
          )}

          {/* Step 1: Hierarchy (2-column on tablet) */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">Curriculum Hierarchy</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Board */}
              <div className="p-4 rounded-card bg-surface border border-border space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="font-heading text-sm font-bold text-ink">Board *</label>
                  {!isNewBoard ? (
                    <button type="button" onClick={() => { setIsNewBoard(true); setSelectedBoard(''); }} className="text-xs text-forest font-semibold cursor-pointer">+ New Board</button>
                  ) : (
                    <button type="button" onClick={() => { setIsNewBoard(false); if (boards.length > 0) setSelectedBoard(boards[0]); }} className="text-xs text-ink/60 cursor-pointer">← Existing</button>
                  )}
                </div>
                {!isNewBoard ? (
                  <CustomSelect value={selectedBoard}
                    onChange={(val) => { if (val === '__NEW__') { setIsNewBoard(true); setSelectedBoard(''); } else setSelectedBoard(val); }}
                    options={[...boards.map((b) => ({ value: b, label: b })), { value: '__NEW__', label: '+ Add New Board...', badge: 'NEW' }]}
                    placeholder="Select board..." className="w-full" />
                ) : (
                  <input type="text" value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="e.g. Cambridge IGCSE" className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" required autoFocus />
                )}
              </div>

              {/* Book */}
              <div className="p-4 rounded-card bg-surface border border-border space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="font-heading text-sm font-bold text-ink">Book / Curriculum *</label>
                  {!isNewBook ? (
                    <button type="button" onClick={() => { setIsNewBook(true); setSelectedBookId('NEW'); }} className="text-xs text-forest font-semibold cursor-pointer">+ New Book</button>
                  ) : books.length > 0 && !isNewBoard ? (
                    <button type="button" onClick={() => { setIsNewBook(false); setSelectedBookId(books[0].id); }} className="text-xs text-ink/60 cursor-pointer">← Existing ({books.length})</button>
                  ) : null}
                </div>
                {!isNewBook && books.length > 0 ? (
                  <CustomSelect value={String(selectedBookId)}
                    onChange={(val) => { if (val === '__NEW__') { setIsNewBook(true); setSelectedBookId('NEW'); } else setSelectedBookId(Number(val)); }}
                    options={[...books.map((bk) => ({ value: String(bk.id), label: `${bk.title} (${bk.grade})` })), { value: '__NEW__', label: '+ Add New Book...', badge: 'NEW' }]}
                    placeholder="Select book..." className="w-full" />
                ) : (
                  <div className="space-y-2.5">
                    <SearchableSubjectSelect value={newBookSubject} onChange={setNewBookSubject} placeholder="Subject (e.g. Mathematics)..." required={isNewBook} />
                    <div className="grid grid-cols-2 gap-2">
                      <CustomSelect value={newBookGrade} onChange={setNewBookGrade}
                        options={['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12']}
                        placeholder="Grade..." className="w-full" />
                      <input type="text" value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)} placeholder="Title (opt.)" className="w-full rounded-card border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chapter */}
              <div className="p-4 rounded-card bg-surface border border-border space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="font-heading text-sm font-bold text-ink">Chapter *</label>
                  {!isNewChapter ? (
                    <button type="button" onClick={() => { setIsNewChapter(true); setSelectedChapterId('NEW'); }} className="text-xs text-forest font-semibold cursor-pointer">+ New Chapter</button>
                  ) : chapters.length > 0 && !isNewBook ? (
                    <button type="button" onClick={() => { setIsNewChapter(false); setSelectedChapterId(chapters[0].id); }} className="text-xs text-ink/60 cursor-pointer">← Existing ({chapters.length})</button>
                  ) : null}
                </div>
                {!isNewChapter && chapters.length > 0 ? (
                  <CustomSelect value={String(selectedChapterId)}
                    onChange={(val) => { if (val === '__NEW__') { setIsNewChapter(true); setSelectedChapterId('NEW'); } else setSelectedChapterId(Number(val)); }}
                    options={[...chapters.map((ch) => ({ value: String(ch.id), label: `Ch.${ch.chapter_order}: ${ch.title}` })), { value: '__NEW__', label: '+ Add New Chapter...', badge: 'NEW' }]}
                    placeholder="Select chapter..." className="w-full" />
                ) : (
                  <input type="text" value={newChapterTitle} onChange={(e) => setNewChapterTitle(e.target.value)} placeholder="e.g. Ch. 1: Quadratic Equations" className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" required={isNewChapter} />
                )}
              </div>

              {/* Topic */}
              <div className="p-4 rounded-card bg-surface border border-border space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="font-heading text-sm font-bold text-ink">Topic *</label>
                  {!isNewTopic ? (
                    <button type="button" onClick={() => { setIsNewTopic(true); setSelectedTopicId('NEW'); }} className="text-xs text-forest font-semibold cursor-pointer">+ New Topic</button>
                  ) : topics.length > 0 && !isNewChapter ? (
                    <button type="button" onClick={() => { setIsNewTopic(false); setSelectedTopicId(topics[0].id); }} className="text-xs text-ink/60 cursor-pointer">← Existing ({topics.length})</button>
                  ) : null}
                </div>
                {!isNewTopic && topics.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-bg rounded-card border border-border">
                      {selectedTopicIds.length === 0 && <span className="text-xs text-ink/40 font-mono">No topics selected.</span>}
                      {selectedTopicIds.map((tId) => {
                        const tObj = topics.find((tp) => tp.id === tId);
                        return (
                          <span key={tId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-xs bg-surface border border-border text-ink font-medium">
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
                  <input type="text" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="e.g. Nature of Roots" className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" required={isNewTopic} />
                )}
              </div>
            </div>
          </section>

          {/* Step 2: Difficulty & Marks */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">Difficulty & Marks</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
                <button key={diff} type="button" onClick={() => setDifficulty(diff)}
                  className={`py-2.5 text-sm font-heading font-semibold rounded-card border transition-all cursor-pointer ${difficulty === diff ? 'border-forest bg-forest text-white' : 'border-border bg-bg text-ink hover:border-forest/50'}`}>
                  {diff}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <CustomSelect value={learnerLevel} onChange={(val) => setLearnerLevel(val as any)}
                options={[{ value: 'BEGINNER', label: 'Beginner (Foundational)' }, { value: 'INTERMEDIATE', label: 'Intermediate (Competency)' }, { value: 'ADVANCED', label: 'Advanced (HOTS)' }]}
                placeholder="Learner level..." className="w-full" />
              <div className="space-y-1">
                <label className="block font-heading text-sm font-semibold text-ink">Primary Marks *</label>
                <input type="number" step="0.5" min="0.5" max="100" value={marks} onChange={(e) => setMarks(e.target.value)} className="w-full rounded-card border border-border bg-bg px-4 py-2.5 text-sm text-ink focus:border-forest focus:outline-none font-mono" />
              </div>
            </div>
          </section>

          {/* Step 3: Question Content */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">Question Content</h2>
            </div>
            <CustomSelect value={questionType} onChange={setQuestionType}
              options={[{ value: 'MCQ', label: 'Multiple Choice (MCQ)' }, { value: 'MSQ', label: 'Multiple Select (MSQ)' }, { value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill in Blanks' }, { value: 'ONE_WORD', label: 'One Word' }, { value: 'MATCH_THE_FOLLOWING', label: 'Match the Following' }]}
              placeholder="Question type..." className="w-full" />
            <div className="space-y-1.5">
              <label className="block font-heading text-sm font-semibold text-ink">Question Statement *</label>
              <textarea rows={4} required value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Enter the question statement..." className="w-full rounded-card border border-border bg-bg p-3.5 text-sm text-ink focus:border-forest focus:outline-none leading-relaxed" />
            </div>
            {['MCQ', 'MSQ', 'MATCH_THE_FOLLOWING'].includes(questionType) && (
              <div className="bg-bg border border-border rounded-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-semibold text-sm text-ink">Answer Choices</span>
                  {options.length < 6 && <button type="button" onClick={addOption} className="text-xs font-semibold text-forest cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>}
                </div>
                {options.map((opt, idx) => (
                  <div key={opt.key} className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-card bg-surface border border-border text-xs font-mono font-bold flex items-center justify-center text-ink shrink-0">{opt.key}</span>
                    <input type="text" required placeholder={`Option ${opt.key}`} value={opt.text} onChange={(e) => handleOptionChange(idx, e.target.value)} className="flex-1 rounded-card border border-border bg-surface px-3.5 py-2 text-sm text-ink focus:border-forest focus:outline-none" />
                    {options.length > 2 && <button type="button" onClick={() => removeOption(idx)} className="p-1 text-ink/40 hover:text-ember cursor-pointer"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block font-heading text-sm font-semibold text-ink">Correct Answer *</label>
              {questionType === 'MCQ' ? (
                <CustomSelect value={correctAnswer} onChange={setCorrectAnswer}
                  options={options.map((opt) => ({ value: opt.key, label: `Option ${opt.key}${opt.text ? ': ' + opt.text.substring(0, 30) : ''}` }))}
                  placeholder="Select correct answer..." className="w-full" />
              ) : (
                <textarea rows={2} required value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="Correct answer / rubric..." className="w-full rounded-card border border-border bg-bg p-3.5 text-sm text-ink focus:border-forest focus:outline-none" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-heading text-sm font-medium text-ink">Explanation (Optional)</label>
                <textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Pedagogical explanation..." className="w-full rounded-card border border-border bg-bg p-3.5 text-sm text-ink focus:border-forest focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block font-heading text-sm font-medium text-ink">Source Reference (Optional)</label>
                <input type="text" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="e.g. NCERT Grade 10 Ch4 Q1" className="w-full rounded-card border border-border bg-bg px-4 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" />
              </div>
            </div>
          </section>

          {/* Step 4: Variants */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
                <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">Variants</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => addVariant('2.00', 'SHORT_ANSWER')} className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill bg-forest/10 border border-forest/20 text-forest cursor-pointer">+2m Short</button>
                <button type="button" onClick={() => addVariant('3.00', 'SHORT_ANSWER')} className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill bg-amber-50 border border-amber-200 text-amber-800 cursor-pointer">+3m Short</button>
                <button type="button" onClick={() => addVariant('5.00', 'LONG_ANSWER')} className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill bg-grape/10 border border-grape/20 text-grape cursor-pointer">+5m Long</button>
              </div>
            </div>
            {variants.length === 0 ? (
              <div className="border border-dashed border-border rounded-card p-8 text-center text-sm text-ink/60 space-y-2">
                <Layers className="w-6 h-6 text-ink/30 mx-auto mb-2" />
                <p>Click +2m, +3m, or +5m to add a variant template.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {variants.map((v, idx) => (
                  <div key={idx} className="bg-bg border border-border rounded-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-sm text-ink">Variant #{idx + 1}</span>
                      <button type="button" onClick={() => removeVariant(idx)} className="text-ink/40 hover:text-rose-600 p-1 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <CustomSelect value={v.variant_type} onChange={(val) => updateVariant(idx, 'variant_type', val)}
                        options={[{ value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'MCQ', label: 'Multiple Choice' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill Blanks' }, { value: 'ONE_WORD', label: 'One Word' }]}
                        placeholder="Format..." className="w-full" />
                      <input type="number" step="0.5" value={v.marks} onChange={(e) => updateVariant(idx, 'marks', e.target.value)} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm text-ink font-mono focus:border-forest focus:outline-none" />
                    </div>
                    <textarea rows={3} required value={v.question_text} onChange={(e) => updateVariant(idx, 'question_text', e.target.value)} placeholder="Variant question text..." className="w-full rounded-card border border-border bg-surface p-3 text-sm text-ink focus:border-forest focus:outline-none" />
                    {v.variant_type === 'MCQ' && (
                      <div className="space-y-1.5">
                        {(v.options || []).map((opt, optIdx) => (
                          <div key={opt.key} className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded text-[11px] font-mono font-bold flex items-center justify-center text-ink bg-surface-muted border border-border shrink-0">{opt.key}</span>
                            <input type="text" required value={opt.text} onChange={(e) => updateVariantOption(idx, optIdx, e.target.value)} placeholder={`Option ${opt.key}`} className="flex-1 rounded-card border border-border bg-bg px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none" />
                            {(v.options?.length || 0) > 2 && <button type="button" onClick={() => removeVariantOption(idx, optIdx)} className="text-ink/40 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                        {(v.options?.length || 0) < 6 && <button type="button" onClick={() => addVariantOption(idx)} className="text-xs text-forest font-semibold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add Choice</button>}
                      </div>
                    )}
                    {v.variant_type === 'MCQ' ? (
                      <CustomSelect value={v.correct_answer || 'A'} onChange={(val) => updateVariant(idx, 'correct_answer', val)}
                        options={(v.options || []).map((opt) => ({ value: opt.key, label: `Option ${opt.key}` }))} placeholder="Correct..." className="w-full" />
                    ) : (
                      <input type="text" required value={v.correct_answer} onChange={(e) => updateVariant(idx, 'correct_answer', e.target.value)} placeholder="Correct answer" className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none" />
                    )}
                    <input type="text" value={v.explanation} onChange={(e) => updateVariant(idx, 'explanation', e.target.value)} placeholder="Hint / Explanation (optional)" className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={() => setActiveTab('explore')} className="px-6 py-2.5 text-sm font-heading font-semibold rounded-pill border border-border bg-surface text-ink cursor-pointer">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 text-sm font-heading font-semibold rounded-pill bg-forest text-white active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50">
              {isSubmitting ? 'Ingesting...' : <><CheckCircle2 className="w-4 h-4" /> Ingest Question + {variants.length} Variants</>}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: Submissions */}
      {activeTab === 'submissions' && <DEOSubmissionsView onNewQuestionClick={() => setActiveTab('ingest')} />}

      {/* TAB 4: Validation */}
      {activeTab === 'validation' && <ValidatorQueueView />}

      {/* ── Question Detail Modal (centered on tablet) ── */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setSelectedQuestion(null)} />
          <div className="relative z-10 bg-surface border border-border rounded-card shadow-float w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <ValidationStatusBadge status={selectedQuestion.validation_status} revision={selectedQuestion.revision} />
                <span className="font-heading font-bold text-ink">Question #{selectedQuestion.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setHistoryQuestionId(selectedQuestion.id)} className="px-3 py-1.5 rounded-pill bg-surface-muted border border-border text-xs font-mono text-ink/80 flex items-center gap-1.5 cursor-pointer">
                  <History className="w-3.5 h-3.5 text-forest" /> History
                </button>
                <button type="button" onClick={() => setSelectedQuestion(null)} className="p-1.5 rounded-card border border-border bg-surface-muted text-ink/70 cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
            </div>
            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 text-xs font-mono font-semibold rounded-pill bg-forest/10 text-forest border border-forest/20">{selectedQuestion.question_type_display || selectedQuestion.question_type}</span>
                <span className="px-2.5 py-1 text-xs font-mono rounded-pill bg-surface-muted text-ink/70 border border-border">{selectedQuestion.marks} Marks</span>
                <span className="px-2.5 py-1 text-xs font-mono rounded-pill bg-surface-muted text-ink/70 border border-border">{selectedQuestion.difficulty}</span>
              </div>
              <p className="text-sm text-ink/60">By: <strong className="text-ink">{selectedQuestion.created_by_name || 'System'}</strong> • {selectedQuestion.school_name || 'Global Bank'}</p>
              <div>
                <span className="text-xs font-mono text-ink/50 uppercase tracking-wider">Question</span>
                <p className="mt-1 text-sm text-ink font-medium leading-relaxed bg-bg p-4 rounded-card border border-border">{selectedQuestion.question_text}</p>
              </div>
              {selectedQuestion.options && (
                <div>
                  <span className="text-xs font-mono text-ink/50 uppercase tracking-wider">Answer Choices</span>
                  <div className="mt-2 space-y-2">
                    {Object.entries(selectedQuestion.options).map(([k, v]) => (
                      <div key={k} className={`p-3 rounded-card text-sm border flex items-center gap-3 ${selectedQuestion.correct_answer === k ? 'border-forest bg-forest/5 text-forest font-semibold' : 'border-border bg-surface text-ink'}`}>
                        <span className="w-6 h-6 rounded-full bg-surface-muted border border-border text-xs font-mono font-bold flex items-center justify-center shrink-0">{k}</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="text-xs font-mono text-ink/50 uppercase tracking-wider">Correct Answer</span>
                <div className="mt-1 p-3 rounded-card border border-border bg-bg text-sm font-mono font-bold text-forest">{selectedQuestion.correct_answer}</div>
              </div>
              {selectedQuestion.explanation && (
                <div>
                  <span className="text-xs font-mono text-ink/50 uppercase tracking-wider">Explanation</span>
                  <p className="mt-1 p-3 rounded-card border border-border bg-bg text-sm text-ink/80 leading-relaxed">{selectedQuestion.explanation}</p>
                </div>
              )}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-sm text-ink">Variants ({selectedQuestion.variants?.length || 0})</span>
                  <button type="button" onClick={() => setQuickVariantModalQuestion(selectedQuestion)} className="px-3 py-1.5 text-xs font-heading font-semibold rounded-pill bg-forest/10 border border-forest/20 text-forest cursor-pointer flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Variant</button>
                </div>
                {(!selectedQuestion.variants || selectedQuestion.variants.length === 0) ? (
                  <p className="text-sm text-ink/50 italic">No variants yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedQuestion.variants.map((v, i) => (
                      <div key={v.id || i} className="p-3 rounded-card border border-border bg-bg space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-heading font-bold text-ink">{v.variant_type_display || v.variant_type}</span>
                          <span className="font-mono text-forest font-semibold">{v.marks}m</span>
                        </div>
                        <p className="text-xs text-ink font-medium leading-relaxed">{v.question_text}</p>
                        <div className="text-xs text-ink/70 pt-1.5 border-t border-border/50"><strong>Answer:</strong> {v.correct_answer}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Variant Modal (centered on tablet) ── */}
      {quickVariantModalQuestion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-6">
          <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setQuickVariantModalQuestion(null)} />
          <form onSubmit={handleQuickVariantSubmit} className="relative z-10 bg-surface border border-border rounded-card shadow-float w-full max-w-lg space-y-4 p-6">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-heading font-bold text-base text-ink">Add Variant to Q#{quickVariantModalQuestion.id}</h3>
                <p className="text-sm text-forest font-semibold mt-0.5">Locked Difficulty: {quickVariantModalQuestion.difficulty}</p>
              </div>
              <button type="button" onClick={() => setQuickVariantModalQuestion(null)} className="p-1.5 rounded-card border border-border bg-surface-muted text-ink/70 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CustomSelect value={quickVariantType}
                onChange={(val) => { setQuickVariantType(val); if (val === 'MCQ' && (!quickVariantAnswer || quickVariantAnswer.length > 1)) setQuickVariantAnswer('A'); }}
                options={[{ value: 'SHORT_ANSWER', label: 'Short Answer' }, { value: 'LONG_ANSWER', label: 'Long Answer' }, { value: 'MCQ', label: 'Multiple Choice' }, { value: 'FILL_IN_THE_BLANKS', label: 'Fill Blanks' }, { value: 'ONE_WORD', label: 'One Word' }]}
                placeholder="Format..." className="w-full" />
              <input type="number" step="0.5" value={quickVariantMarks} onChange={(e) => setQuickVariantMarks(e.target.value)} className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-sm font-mono text-ink focus:border-forest focus:outline-none" />
            </div>
            <textarea rows={3} required value={quickVariantText} onChange={(e) => setQuickVariantText(e.target.value)} placeholder="Variant question text..." className="w-full rounded-card border border-border bg-bg p-3.5 text-sm text-ink focus:border-forest focus:outline-none" />
            {quickVariantType === 'MCQ' && (
              <div className="space-y-2">
                {quickVariantOptions.map((opt, optIdx) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded text-xs font-mono font-bold flex items-center justify-center text-ink bg-surface-muted border border-border shrink-0">{opt.key}</span>
                    <input type="text" required value={opt.text} onChange={(e) => updateQuickVariantOption(optIdx, e.target.value)} placeholder={`Option ${opt.key}`} className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none" />
                    {quickVariantOptions.length > 2 && <button type="button" onClick={() => removeQuickVariantOption(optIdx)} className="text-ink/40 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                ))}
                {quickVariantOptions.length < 6 && <button type="button" onClick={addQuickVariantOption} className="text-xs text-forest font-semibold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add Choice</button>}
              </div>
            )}
            {quickVariantType === 'MCQ' ? (
              <CustomSelect value={quickVariantAnswer || 'A'} onChange={setQuickVariantAnswer}
                options={quickVariantOptions.map((opt) => ({ value: opt.key, label: `Option ${opt.key}` }))} placeholder="Correct option..." className="w-full" />
            ) : (
              <input type="text" required value={quickVariantAnswer} onChange={(e) => setQuickVariantAnswer(e.target.value)} placeholder="Correct answer..." className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" />
            )}
            <input type="text" value={quickVariantExplanation} onChange={(e) => setQuickVariantExplanation(e.target.value)} placeholder="Hint / Explanation (optional)" className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" />
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <button type="button" onClick={() => setQuickVariantModalQuestion(null)} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded-pill border border-border bg-surface text-ink cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmittingQuickVariant} className="flex-1 py-2.5 text-sm font-heading font-semibold rounded-pill bg-forest text-white cursor-pointer disabled:opacity-50">
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
