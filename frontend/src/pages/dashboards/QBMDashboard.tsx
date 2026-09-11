import React, { useState, useEffect } from 'react';
import { contentApi, type IngestQuestionPayload } from '../../api/content';
import type { Book, Chapter, Question, Topic } from '../../types';
import {
  Database,
  Plus,
  Search,
  Layers,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Trash2,
  X,
  FileQuestion,
} from 'lucide-react';

export const QBMDashboard: React.FC = () => {

  // Active view tab: 'explore' or 'ingest'
  const [activeTab, setActiveTab] = useState<'explore' | 'ingest'>('explore');

  // Question bank explorer state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBoard, setFilterBoard] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterDifficulty, setFilterDifficulty] = useState('ALL');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  // Ingestion workflow hierarchy state
  const [boards, setBoards] = useState<string[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  // Selected Ingestion hierarchy
  const [selectedBoard, setSelectedBoard] = useState('CBSE');
  const [isCustomBoard, setIsCustomBoard] = useState(false);
  const [customBoardName, setCustomBoardName] = useState('');
  const [isCustomHierarchy, setIsCustomHierarchy] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customGrade, setCustomGrade] = useState('Class 10');
  const [customBookTitle, setCustomBookTitle] = useState('');
  const [customChapterTitle, setCustomChapterTitle] = useState('');
  const [customTopicName, setCustomTopicName] = useState('');

  const [selectedBookId, setSelectedBookId] = useState<number | ''>('');
  const [selectedChapterId, setSelectedChapterId] = useState<number | ''>('');
  const [selectedTopicId, setSelectedTopicId] = useState<number | ''>('');

  // Step 2 & 3: Question properties
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [learnerLevel, setLearnerLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('INTERMEDIATE');
  const [questionType, setQuestionType] = useState<string>('MCQ');
  const [marks, setMarks] = useState<string>('1.00');
  const [questionText, setQuestionText] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [explanation, setExplanation] = useState('');

  // MCQ Options
  const [options, setOptions] = useState<{ key: string; text: string }[]>([
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
  ]);
  const [correctAnswer, setCorrectAnswer] = useState('A');

  // Step 4: Variants
  const [variants, setVariants] = useState<
    Array<{
      variant_type: string;
      marks: string;
      question_text: string;
      correct_answer: string;
      explanation: string;
    }>
  >([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ingestSuccessMsg, setIngestSuccessMsg] = useState<string | null>(null);
  const [ingestErrorMsg, setIngestErrorMsg] = useState<string | null>(null);

  // Quick variant modal state on existing question
  const [quickVariantModalQuestion, setQuickVariantModalQuestion] = useState<Question | null>(null);
  const [quickVariantType, setQuickVariantType] = useState('SHORT_ANSWER');
  const [quickVariantMarks, setQuickVariantMarks] = useState('2.00');
  const [quickVariantText, setQuickVariantText] = useState('');
  const [quickVariantAnswer, setQuickVariantAnswer] = useState('');
  const [quickVariantExplanation, setQuickVariantExplanation] = useState('');
  const [isSubmittingQuickVariant, setIsSubmittingQuickVariant] = useState(false);

  // Load Boards on mount
  useEffect(() => {
    contentApi
      .getBoards()
      .then((b) => {
        setBoards(b);
        if (b.length > 0 && !b.includes(selectedBoard)) {
          setSelectedBoard(b[0]);
        }
      })
      .catch(() => setBoards(['CBSE', 'ICSE', 'State Board']));
  }, []);

  // Load Books when selectedBoard changes
  useEffect(() => {
    if (selectedBoard) {
      if (selectedBoard === 'Other / Custom Board') {
        setIsCustomBoard(true);
        setBooks([]);
        setSelectedBookId('');
        setIsCustomHierarchy(true);
        return;
      }
      setIsCustomBoard(false);
      contentApi
        .getBooks(selectedBoard)
        .then((bks) => {
          setBooks(bks);
          if (bks.length > 0) {
            setSelectedBookId(bks[0].id);
            setIsCustomHierarchy(false);
          } else {
            setSelectedBookId('');
            setIsCustomHierarchy(true);
          }
        })
        .catch(() => {
          setBooks([]);
          setIsCustomHierarchy(true);
        });
    }
  }, [selectedBoard]);

  // Load Chapters when selectedBookId changes
  useEffect(() => {
    if (selectedBookId) {
      contentApi
        .getChapters(Number(selectedBookId))
        .then((chaps) => {
          setChapters(chaps);
          if (chaps.length > 0) {
            setSelectedChapterId(chaps[0].id);
          } else {
            setSelectedChapterId('');
          }
        })
        .catch(() => setChapters([]));
    } else {
      setChapters([]);
      setSelectedChapterId('');
    }
  }, [selectedBookId]);

  // Load Topics when selectedChapterId changes
  useEffect(() => {
    if (selectedChapterId) {
      contentApi
        .getTopics(Number(selectedChapterId))
        .then((topList) => {
          setTopics(topList);
          if (topList.length > 0) {
            setSelectedTopicId(topList[0].id);
          } else {
            setSelectedTopicId('');
          }
        })
        .catch(() => setTopics([]));
    } else {
      setTopics([]);
      setSelectedTopicId('');
    }
  }, [selectedChapterId]);

  // Load Questions for Explorer
  const loadQuestions = () => {
    setIsLoadingQuestions(true);
    const params: Record<string, any> = {};
    if (filterType !== 'ALL') params.question_type = filterType;
    if (filterDifficulty !== 'ALL') params.difficulty = filterDifficulty;

    contentApi
      .getQuestions(params)
      .then((data) => {
        setQuestions(data);
      })
      .catch((err) => {
        console.error('Failed to load questions:', err);
      })
      .finally(() => {
        setIsLoadingQuestions(false);
      });
  };

  useEffect(() => {
    loadQuestions();
  }, [filterType, filterDifficulty]);

  // Handle Option change
  const handleOptionChange = (idx: number, text: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx].text = text;
      return next;
    });
  };

  // Add Option row
  const addOption = () => {
    if (options.length >= 6) return;
    const nextKey = String.fromCharCode(65 + options.length);
    setOptions((prev) => [...prev, { key: nextKey, text: '' }]);
  };

  // Remove Option row
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      return filtered.map((item, i) => ({
        key: String.fromCharCode(65 + i),
        text: item.text,
      }));
    });
  };

  // Add a variant template
  const addVariant = (presetMarks?: string, presetType?: string) => {
    setVariants((prev) => [
      ...prev,
      {
        variant_type: presetType || 'SHORT_ANSWER',
        marks: presetMarks || '2.00',
        question_text: '',
        correct_answer: '',
        explanation: '',
      },
    ]);
  };

  const removeVariant = (idx: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx: number, field: string, val: string) => {
    setVariants((prev) => {
      const copy = [...prev];
      (copy[idx] as any)[field] = val;
      return copy;
    });
  };

  // Ingest Form Submit
  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngestSuccessMsg(null);
    setIngestErrorMsg(null);

    const effectiveBoard = isCustomBoard ? customBoardName.trim() : selectedBoard;
    if (!effectiveBoard) {
      setIngestErrorMsg('Please specify an educational Board.');
      return;
    }

    if (!isCustomHierarchy && !selectedTopicId) {
      setIngestErrorMsg('Please select a curriculum Board, Book, Chapter, and Topic (or switch to Custom Curriculum).');
      return;
    }

    if (isCustomHierarchy) {
      if (!customSubject.trim()) {
        setIngestErrorMsg('Subject is required for custom curriculum.');
        return;
      }
      if (!customChapterTitle.trim()) {
        setIngestErrorMsg('Chapter Title is required for custom curriculum.');
        return;
      }
      if (!customTopicName.trim()) {
        setIngestErrorMsg('Topic Name is required for custom curriculum.');
        return;
      }
    }

    if (!questionText.trim()) {
      setIngestErrorMsg('Question text is required.');
      return;
    }

    if (!correctAnswer.trim()) {
      setIngestErrorMsg('Correct answer is required.');
      return;
    }

    // Format options map if MCQ/MSQ
    let formattedOptions: Record<string, string> | null = null;
    if (['MCQ', 'MSQ', 'MATCH_THE_FOLLOWING'].includes(questionType)) {
      formattedOptions = {};
      options.forEach((opt) => {
        if (opt.text.trim()) {
          formattedOptions![opt.key] = opt.text.trim();
        }
      });
    }

    const payload: IngestQuestionPayload = {
      topic: !isCustomHierarchy && selectedTopicId ? Number(selectedTopicId) : null,
      board: effectiveBoard,
      book_title: isCustomHierarchy ? (customBookTitle.trim() || `${customSubject.trim()} (${customGrade.trim()})`) : undefined,
      subject: isCustomHierarchy ? customSubject.trim() : undefined,
      grade: isCustomHierarchy ? customGrade.trim() : undefined,
      chapter_title: isCustomHierarchy ? customChapterTitle.trim() : undefined,
      topic_name: isCustomHierarchy ? customTopicName.trim() : undefined,
      question_text: questionText.trim(),
      question_type: questionType,
      marks,
      difficulty,
      learner_level: learnerLevel,
      bank_source: 'GLOBAL',
      options: formattedOptions,
      correct_answer: correctAnswer.trim(),
      explanation: explanation.trim(),
      source_reference: sourceReference.trim(),
      variants: variants
        .filter((v) => v.question_text.trim())
        .map((v) => ({
          variant_type: v.variant_type,
          marks: v.marks,
          question_text: v.question_text.trim(),
          correct_answer: v.correct_answer.trim(),
          explanation: v.explanation.trim(),
        })),
    };

    setIsSubmitting(true);
    try {
      const created = await contentApi.ingestQuestion(payload);
      setIngestSuccessMsg(
        `Question #${created.id} and ${created.variants?.length || variants.length} variant(s) successfully ingested into the Global Question Bank!`
      );
      // Reset form fields
      setQuestionText('');
      setExplanation('');
      setSourceReference('');
      setVariants([]);
      if (isCustomHierarchy) {
        contentApi.getBooks(effectiveBoard).then((bks) => setBooks(bks));
      }
      loadQuestions();
    } catch (err: any) {
      setIngestErrorMsg(
        err.response?.data?.detail ||
          (err.response?.data && typeof err.response.data === 'object'
            ? JSON.stringify(err.response.data)
            : 'Failed to ingest question.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit quick variant on existing question
  const handleQuickVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVariantModalQuestion) return;

    if (!quickVariantText.trim() || !quickVariantAnswer.trim()) {
      alert('Variant question text and answer are required.');
      return;
    }

    setIsSubmittingQuickVariant(true);
    try {
      await contentApi.addVariant(quickVariantModalQuestion.id, {
        variant_type: quickVariantType as any,
        marks: quickVariantMarks,
        difficulty: quickVariantModalQuestion.difficulty, // Enforce AC-15
        question_text: quickVariantText.trim(),
        correct_answer: quickVariantAnswer.trim(),
        explanation: quickVariantExplanation.trim(),
      });

      // Reload question detail
      const refreshed = await contentApi.getQuestion(quickVariantModalQuestion.id);
      setSelectedQuestion(refreshed);
      setQuickVariantModalQuestion(null);
      setQuickVariantText('');
      setQuickVariantAnswer('');
      setQuickVariantExplanation('');
      loadQuestions();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to add variant.');
    } finally {
      setIsSubmittingQuickVariant(false);
    }
  };

  // Filtered explorer questions
  const filteredQuestions = questions.filter((q) => {
    if (filterBoard !== 'ALL' && q.book_board && q.book_board !== filterBoard) return false;
    if (searchTerm.trim()) {
      const match =
        q.question_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.topic_name && q.topic_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (q.chapter_title && q.chapter_title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (q.book_title && q.book_title.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── Page Header ── */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-forest/10 border border-forest/20 text-xs font-semibold text-forest">
            <Sparkles className="w-3.5 h-3.5" />
            Central Question Bank Manager
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Curriculum Ingestion Engine
          </h1>
          <p className="font-body text-ink/75 text-sm max-w-2xl leading-relaxed">
            Standardize and ingest board-certified questions, multi-tier difficulty rubrics, and variant
            architectures directly into the centralized platform question bank.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-muted border border-border rounded-pill self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'explore'
                ? 'bg-forest text-white shadow-xs'
                : 'text-ink/70 hover:text-ink'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Question Explorer ({questions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ingest')}
            className={`px-4 py-2 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'ingest'
                ? 'bg-forest text-white shadow-xs'
                : 'text-ink/70 hover:text-ink'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ingest Question + Variants</span>
          </button>
        </div>
      </div>

      {/* ── Metric Highlights ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">Global Repository</span>
          <div className="font-heading font-bold text-2xl text-ink mt-1">{questions.length}</div>
          <p className="text-[11px] text-forest font-medium mt-0.5">Platform Available</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">With Variants</span>
          <div className="font-heading font-bold text-2xl text-forest mt-1">
            {questions.filter((q) => (q.variants_count || 0) > 0).length}
          </div>
          <p className="text-[11px] text-ink/60 mt-0.5">AC-15 Difficulty Locked</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">Curriculum Boards</span>
          <div className="font-heading font-bold text-2xl text-ink mt-1">{boards.length || 3}</div>
          <p className="text-[11px] text-ink/60 mt-0.5">CBSE, ICSE & State</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="text-[11px] font-mono text-ink/60 uppercase tracking-wider">Active Chapters</span>
          <div className="font-heading font-bold text-2xl text-ink mt-1">{chapters.length || 1}</div>
          <p className="text-[11px] text-ink/60 mt-0.5">Structured Topics</p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: QUESTION EXPLORER                                                 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'explore' && (
        <div className="space-y-6">
          {/* Filter Toolbar */}
          <div className="bg-surface border border-border rounded-card p-4 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by question, topic, chapter, book..."
                className="w-full pl-9 pr-4 py-2 rounded-pill border border-border bg-bg text-xs font-body text-ink focus:outline-none focus:border-forest"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Board selector */}
              <select
                value={filterBoard}
                onChange={(e) => setFilterBoard(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-pill border border-border bg-bg text-ink cursor-pointer focus:border-forest focus:outline-none"
              >
                <option value="ALL">All Boards</option>
                {boards.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* Type filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-pill border border-border bg-bg text-ink cursor-pointer focus:border-forest focus:outline-none"
              >
                <option value="ALL">All Question Types</option>
                <option value="MCQ">Multiple Choice (MCQ)</option>
                <option value="MSQ">Multiple Select (MSQ)</option>
                <option value="SHORT_ANSWER">Short Answer</option>
                <option value="LONG_ANSWER">Long Answer</option>
                <option value="FILL_IN_THE_BLANKS">Fill in Blanks</option>
                <option value="ONE_WORD">One Word</option>
                <option value="MATCH_THE_FOLLOWING">Match the Following</option>
                <option value="DIAGRAM_BASED">Diagram Based</option>
                <option value="COMPREHENSION_BASED">Comprehension Based</option>
              </select>

              {/* Difficulty filter */}
              <select
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-pill border border-border bg-bg text-ink cursor-pointer focus:border-forest focus:outline-none"
              >
                <option value="ALL">All Difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
          </div>

          {/* Question Cards Grid */}
          {isLoadingQuestions ? (
            <div className="p-12 text-center text-xs text-ink/60">Loading global questions repository...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="bg-surface border border-border rounded-card p-12 text-center space-y-3 shadow-card">
              <FileQuestion className="w-10 h-10 text-ink/30 mx-auto" />
              <h3 className="font-heading font-semibold text-ink text-sm">No Questions Found</h3>
              <p className="text-xs text-ink/60 max-w-sm mx-auto">
                No questions match your filter criteria, or none have been ingested yet.
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredQuestions.map((q) => (
                <div
                  key={q.id}
                  onClick={() => setSelectedQuestion(q)}
                  className="bg-surface border border-border hover:border-forest/50 transition-all rounded-card p-4 shadow-card flex flex-col justify-between cursor-pointer group"
                >
                  <div className="space-y-2.5">
                    {/* Tags row */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
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
                  <div className="border-t border-border mt-3 pt-2.5 flex items-center justify-between text-[11px] text-ink/60">
                    <span className="truncate max-w-[200px]">
                      {q.chapter_title ? `${q.chapter_title} • ` : ''}
                      {q.topic_name || 'General Topic'}
                    </span>
                    <span className="font-heading font-semibold text-forest group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[11px]">
                      View & Add Variants <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
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
              {/* Toggle switch between Existing DB Curriculum and Custom Curriculum */}
              <div className="flex items-center gap-2 bg-bg px-2.5 py-1 rounded-card border border-border text-xs self-start sm:self-auto">
                <span className="text-ink/60 font-medium">Mode:</span>
                <button
                  type="button"
                  onClick={() => setIsCustomHierarchy(false)}
                  disabled={books.length === 0}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    !isCustomHierarchy
                      ? 'bg-forest text-white shadow-xs'
                      : 'text-ink/60 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                  title={books.length === 0 ? 'No pre-configured books available for this board' : undefined}
                >
                  Existing Books ({books.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomHierarchy(true)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    isCustomHierarchy
                      ? 'bg-forest text-white shadow-xs'
                      : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  + Custom / Expand Syllabus
                </button>
              </div>
            </div>

            {/* Board Selection Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-semibold text-ink">
                  1. Board *
                </label>
                <select
                  value={selectedBoard}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedBoard(val);
                    if (val === 'Other / State Board' || val === 'Other / Custom Board') {
                      setIsCustomBoard(true);
                    } else {
                      setIsCustomBoard(false);
                    }
                  }}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                >
                  {boards.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {isCustomBoard && (
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    Specify Custom Board Name *
                  </label>
                  <input
                    type="text"
                    value={customBoardName}
                    onChange={(e) => setCustomBoardName(e.target.value)}
                    placeholder="e.g. Goa State Board, AP Inter, etc."
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none"
                    required
                  />
                </div>
              )}
            </div>

            {/* Notice if no existing books for selected board */}
            {books.length === 0 && !isCustomBoard && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800 flex items-start gap-2">
                <span className="font-semibold shrink-0">Note:</span>
                <span>
                  No pre-configured books found for <strong>{selectedBoard}</strong> in database yet.
                  Fill in the custom fields below to ingest questions and automatically create this curriculum hierarchy.
                </span>
              </div>
            )}

            {/* Existing Dropdowns OR Custom Hierarchy Inputs */}
            {!isCustomHierarchy ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Book */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    2. Book / Curriculum *
                  </label>
                  <select
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(Number(e.target.value))}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {books.map((bk) => (
                      <option key={bk.id} value={bk.id}>
                        {bk.title} ({bk.grade})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chapter */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    3. Chapter *
                  </label>
                  <select
                    value={selectedChapterId}
                    onChange={(e) => setSelectedChapterId(Number(e.target.value))}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        Ch.{ch.chapter_order}: {ch.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Topic */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    4. Topic *
                  </label>
                  <select
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(Number(e.target.value))}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {topics.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-card bg-surface-muted/60 border border-border">
                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    Subject *
                  </label>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                    required={isCustomHierarchy}
                  />
                </div>

                {/* Grade */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    Grade / Class *
                  </label>
                  <select
                    value={customGrade}
                    onChange={(e) => setCustomGrade(e.target.value)}
                    className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {[
                      'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                      'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
                      'Class 11', 'Class 12'
                    ].map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Book Title */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    Book Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={customBookTitle}
                    onChange={(e) => setCustomBookTitle(e.target.value)}
                    placeholder="e.g. Balbharati Math 10"
                    className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                  />
                </div>

                {/* Chapter Title */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    Chapter Title *
                  </label>
                  <input
                    type="text"
                    value={customChapterTitle}
                    onChange={(e) => setCustomChapterTitle(e.target.value)}
                    placeholder="e.g. Quadratic Equations"
                    className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                    required={isCustomHierarchy}
                  />
                </div>

                {/* Topic Name */}
                <div className="space-y-1.5">
                  <label className="block font-heading text-xs font-semibold text-ink">
                    Topic Name *
                  </label>
                  <input
                    type="text"
                    value={customTopicName}
                    onChange={(e) => setCustomTopicName(e.target.value)}
                    placeholder="e.g. Nature of Roots"
                    className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                    required={isCustomHierarchy}
                  />
                </div>
              </div>
            )}
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
                  Difficulty (Locks Child Variants per AC-15) *
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
                <select
                  value={learnerLevel}
                  onChange={(e) => setLearnerLevel(e.target.value as any)}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                >
                  <option value="BEGINNER">Beginner (Foundational)</option>
                  <option value="INTERMEDIATE">Intermediate (Competency)</option>
                  <option value="ADVANCED">Advanced (HOTS)</option>
                </select>
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
                Question Content & Format (AC-16)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-semibold text-ink">
                  Question Format / Type *
                </label>
                <select
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value)}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none cursor-pointer"
                >
                  <option value="MCQ">Multiple Choice Question (Single Select)</option>
                  <option value="MSQ">Multiple Select Question (MSQ)</option>
                  <option value="SHORT_ANSWER">Short Answer (1-2 Marks)</option>
                  <option value="LONG_ANSWER">Long Answer (3-5 Marks)</option>
                  <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
                  <option value="ONE_WORD">One Word Response</option>
                  <option value="MATCH_THE_FOLLOWING">Match the Following</option>
                  <option value="DIAGRAM_BASED">Diagram Based Question</option>
                  <option value="COMPREHENSION_BASED">Case Study / Comprehension Based</option>
                </select>
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
                  <select
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    className="rounded-card border border-border bg-bg px-3 py-1.5 text-xs font-mono font-bold text-forest focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {options.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        Option {opt.key}
                      </option>
                    ))}
                  </select>
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

          {/* ── STEP 4: Question Variants Architecture (AC-15, AC-16) ── */}
          <section className="space-y-4">
            <div className="border-b border-border pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-forest text-white text-[11px] font-bold flex items-center justify-center">
                  4
                </span>
                <div>
                  <h2 className="font-heading font-bold text-sm text-ink uppercase tracking-wider">
                    Question Variants Architecture (AC-15, AC-16)
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
                        <select
                          value={v.variant_type}
                          onChange={(e) => updateVariant(idx, 'variant_type', e.target.value)}
                          className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink cursor-pointer focus:border-forest focus:outline-none"
                        >
                          <option value="SHORT_ANSWER">Short Answer</option>
                          <option value="LONG_ANSWER">Long Answer</option>
                          <option value="MCQ">Multiple Choice</option>
                          <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
                          <option value="ONE_WORD">One Word</option>
                        </select>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Variant Answer *</label>
                        <input
                          type="text"
                          required
                          value={v.correct_answer}
                          onChange={(e) => updateVariant(idx, 'correct_answer', e.target.value)}
                          placeholder="Correct key or scoring note"
                          className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-forest focus:outline-none"
                        />
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
                <div className="flex items-center gap-2 mb-1">
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
                <h3 className="font-heading font-bold text-base text-ink">
                  Question #{selectedQuestion.id}
                </h3>
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
                  Locked Difficulty: {quickVariantModalQuestion.difficulty} (AC-15 Strict Policy)
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
                <select
                  value={quickVariantType}
                  onChange={(e) => setQuickVariantType(e.target.value)}
                  className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink cursor-pointer focus:border-forest focus:outline-none"
                >
                  <option value="SHORT_ANSWER">Short Answer</option>
                  <option value="LONG_ANSWER">Long Answer</option>
                  <option value="MCQ">Multiple Choice</option>
                  <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
                  <option value="ONE_WORD">One Word</option>
                </select>
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

            <div className="space-y-1">
              <label className="text-xs font-heading font-semibold text-ink">Correct Answer *</label>
              <input
                type="text"
                required
                value={quickVariantAnswer}
                onChange={(e) => setQuickVariantAnswer(e.target.value)}
                placeholder="Correct answer or scoring criteria"
                className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none"
              />
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
    </div>
  );
};
