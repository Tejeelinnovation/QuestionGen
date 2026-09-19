import { useState, useEffect } from 'react';
import { contentApi, type IngestQuestionPayload, type QuestionStats } from '../api/content';
import type { Book, Chapter, Question, Topic } from '../types';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../context/ToastContext';

export type QBMActiveTab = 'explore' | 'ingest' | 'submissions' | 'validation';

export function useQBMDashboard(initialTab?: QBMActiveTab) {
  const { hasCapability } = useAuth();
  const isDEO = hasCapability('DATA_ENTRY_OPERATOR');
  const isValidator = hasCapability('VALIDATOR');
  const isQBM = hasCapability('INGEST_GLOBAL_QUESTIONS') || hasCapability('CREATE_SCHOOL');

  const defaultTab: QBMActiveTab = initialTab
    ? initialTab
    : isValidator && !isDEO && !isQBM
    ? 'validation'
    : isDEO && !isValidator && !isQBM
    ? 'submissions'
    : 'explore';

  const [activeTab, setActiveTab] = useState<QBMActiveTab>(defaultTab);
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('newest');
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterBoard, setFilterBoard] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterDifficulty, setFilterDifficulty] = useState('ALL');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [historyQuestionId, setHistoryQuestionId] = useState<number | null>(null);
  const toast = useToast();
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [boards, setBoards] = useState<string[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedBoard, setSelectedBoard] = useState('CBSE');
  const [isNewBoard, setIsNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<number | '' | 'NEW'>('');
  const [isNewBook, setIsNewBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookSubject, setNewBookSubject] = useState('');
  const [newBookGrade, setNewBookGrade] = useState('Class 10');
  const [selectedChapterId, setSelectedChapterId] = useState<number | '' | 'NEW'>('');
  const [isNewChapter, setIsNewChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<number | '' | 'NEW'>('');
  const [isNewTopic, setIsNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [learnerLevel, setLearnerLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('INTERMEDIATE');
  const [questionType, setQuestionType] = useState<string>('MCQ');
  const [marks, setMarks] = useState<string>('1.00');
  const [questionText, setQuestionText] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<{ key: string; text: string }[]>([
    { key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' },
  ]);
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [variants, setVariants] = useState<Array<{
    variant_type: string; marks: string; question_text: string; correct_answer: string;
    explanation: string; options?: Array<{ key: string; text: string }>;
  }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ingestSuccessMsg, setIngestSuccessMsg] = useState<string | null>(null);
  const [ingestErrorMsg, setIngestErrorMsg] = useState<string | null>(null);
  const [quickVariantModalQuestion, setQuickVariantModalQuestion] = useState<Question | null>(null);
  const [quickVariantType, setQuickVariantType] = useState('SHORT_ANSWER');
  const [quickVariantMarks, setQuickVariantMarks] = useState('2.00');
  const [quickVariantText, setQuickVariantText] = useState('');
  const [quickVariantAnswer, setQuickVariantAnswer] = useState('');
  const [quickVariantExplanation, setQuickVariantExplanation] = useState('');
  const [quickVariantOptions, setQuickVariantOptions] = useState<Array<{ key: string; text: string }>>([
    { key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' },
  ]);
  const [isSubmittingQuickVariant, setIsSubmittingQuickVariant] = useState(false);

  useEffect(() => {
    contentApi.getBoards()
      .then((b) => { setBoards(b); if (b.length > 0 && !b.includes(selectedBoard)) setSelectedBoard(b[0]); })
      .catch(() => setBoards(['CBSE', 'ICSE', 'State Board']));
  }, []);

  useEffect(() => {
    if (isNewBoard) { setBooks([]); setSelectedBookId('NEW'); setIsNewBook(true); return; }
    if (selectedBoard) {
      contentApi.getBooks(selectedBoard)
        .then((bks) => { setBooks(bks); if (bks.length > 0) { setSelectedBookId(bks[0].id); setIsNewBook(false); } else { setSelectedBookId('NEW'); setIsNewBook(true); } })
        .catch(() => { setBooks([]); setSelectedBookId('NEW'); setIsNewBook(true); });
    }
  }, [selectedBoard, isNewBoard]);

  useEffect(() => {
    if (isNewBook || selectedBookId === 'NEW' || !selectedBookId) { setChapters([]); setSelectedChapterId('NEW'); setIsNewChapter(true); return; }
    contentApi.getChapters(Number(selectedBookId))
      .then((chaps) => { setChapters(chaps); if (chaps.length > 0) { setSelectedChapterId(chaps[0].id); setIsNewChapter(false); } else { setSelectedChapterId('NEW'); setIsNewChapter(true); } })
      .catch(() => { setChapters([]); setSelectedChapterId('NEW'); setIsNewChapter(true); });
  }, [selectedBookId, isNewBook]);

  useEffect(() => {
    if (isNewChapter || selectedChapterId === 'NEW' || !selectedChapterId) { setTopics([]); setSelectedTopicId('NEW'); setSelectedTopicIds([]); setIsNewTopic(true); return; }
    contentApi.getTopics(Number(selectedChapterId))
      .then((topList) => { setTopics(topList); if (topList.length > 0) { setSelectedTopicId(topList[0].id); setSelectedTopicIds([topList[0].id]); setIsNewTopic(false); } else { setSelectedTopicId('NEW'); setSelectedTopicIds([]); setIsNewTopic(true); } })
      .catch(() => { setTopics([]); setSelectedTopicId('NEW'); setSelectedTopicIds([]); setIsNewTopic(true); });
  }, [selectedChapterId, isNewChapter]);

  const loadStats = () => {
    contentApi.getQuestionStats().then((data) => setStats(data)).catch((err) => console.error('Failed to load question stats:', err));
  };
  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchTerm); setCurrentPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadQuestions = () => {
    setIsLoadingQuestions(true);
    const params: Record<string, any> = { page: currentPage, page_size: pageSize };
    if (filterBoard !== 'ALL') params.board = filterBoard;
    if (filterType !== 'ALL') params.question_type = filterType;
    if (filterDifficulty !== 'ALL') params.difficulty = filterDifficulty;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (sortBy) params.ordering = sortBy;
    contentApi.getQuestions(params)
      .then((data) => { setQuestions(data.results || []); setTotalCount(data.count || 0); })
      .catch((err) => console.error('Failed to load questions:', err))
      .finally(() => setIsLoadingQuestions(false));
  };
  useEffect(() => { loadQuestions(); }, [currentPage, pageSize, debouncedSearch, filterBoard, filterType, filterDifficulty, sortBy]);

  const handleBoardChange = (b: string) => { setFilterBoard(b); setCurrentPage(1); };
  const handleTypeChange = (t: string) => { setFilterType(t); setCurrentPage(1); };
  const handleDifficultyChange = (d: string) => { setFilterDifficulty(d); setCurrentPage(1); };
  const handleSortChange = (s: string) => { setSortBy(s); setCurrentPage(1); };

  const handleOptionChange = (idx: number, text: string) => setOptions((prev) => { const next = [...prev]; next[idx].text = text; return next; });
  const addOption = () => { if (options.length >= 6) return; setOptions((prev) => [...prev, { key: String.fromCharCode(65 + prev.length), text: '' }]); };
  const removeOption = (idx: number) => { if (options.length <= 2) return; setOptions((prev) => prev.filter((_, i) => i !== idx).map((item, i) => ({ key: String.fromCharCode(65 + i), text: item.text }))); };

  const addVariant = (presetMarks?: string, presetType?: string) => {
    const type = presetType || 'SHORT_ANSWER';
    setVariants((prev) => [...prev, {
      variant_type: type, marks: presetMarks || '2.00', question_text: '', correct_answer: type === 'MCQ' ? 'A' : '', explanation: '',
      options: type === 'MCQ' ? [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }] : undefined,
    }]);
  };
  const removeVariant = (idx: number) => setVariants((prev) => prev.filter((_, i) => i !== idx));
  const updateVariant = (idx: number, field: string, val: any) => {
    setVariants((prev) => {
      const copy = [...prev];
      (copy[idx] as any)[field] = val;
      if (field === 'variant_type' && val === 'MCQ') {
        if (!copy[idx].options || copy[idx].options!.length === 0) copy[idx].options = [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }];
        if (!copy[idx].correct_answer || copy[idx].correct_answer.length > 1) copy[idx].correct_answer = 'A';
      }
      return copy;
    });
  };
  const addVariantOption = (variantIdx: number) => {
    setVariants((prev) => {
      const copy = [...prev]; const curOpts = copy[variantIdx].options || [];
      if (curOpts.length >= 6) return prev;
      copy[variantIdx] = { ...copy[variantIdx], options: [...curOpts, { key: String.fromCharCode(65 + curOpts.length), text: '' }] };
      return copy;
    });
  };
  const removeVariantOption = (variantIdx: number, optIdx: number) => {
    setVariants((prev) => {
      const copy = [...prev]; const curOpts = copy[variantIdx].options || [];
      if (curOpts.length <= 2) return prev;
      const reindexed = curOpts.filter((_, i) => i !== optIdx).map((item, i) => ({ key: String.fromCharCode(65 + i), text: item.text }));
      let ans = copy[variantIdx].correct_answer; if (!reindexed.some((o) => o.key === ans)) ans = 'A';
      copy[variantIdx] = { ...copy[variantIdx], options: reindexed, correct_answer: ans }; return copy;
    });
  };
  const updateVariantOption = (variantIdx: number, optIdx: number, text: string) => {
    setVariants((prev) => {
      const copy = [...prev]; const updatedOpts = [...(copy[variantIdx].options || [])];
      updatedOpts[optIdx] = { ...updatedOpts[optIdx], text };
      copy[variantIdx] = { ...copy[variantIdx], options: updatedOpts }; return copy;
    });
  };

  const addQuickVariantOption = () => { if (quickVariantOptions.length >= 6) return; setQuickVariantOptions((prev) => [...prev, { key: String.fromCharCode(65 + prev.length), text: '' }]); };
  const removeQuickVariantOption = (optIdx: number) => {
    if (quickVariantOptions.length <= 2) return;
    setQuickVariantOptions((prev) => {
      const reindexed = prev.filter((_, i) => i !== optIdx).map((item, i) => ({ key: String.fromCharCode(65 + i), text: item.text }));
      if (!reindexed.some((o) => o.key === quickVariantAnswer)) setQuickVariantAnswer('A');
      return reindexed;
    });
  };
  const updateQuickVariantOption = (optIdx: number, text: string) => setQuickVariantOptions((prev) => { const updated = [...prev]; updated[optIdx] = { ...updated[optIdx], text }; return updated; });

  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setIngestSuccessMsg(null); setIngestErrorMsg(null);
    const effectiveBoard = isNewBoard ? newBoardName.trim() : selectedBoard;
    if (!effectiveBoard) { setIngestErrorMsg('Please specify or select an educational Board.'); toast.warning('Please specify or select an educational Board.'); return; }
    if (isNewBook) {
      if (!newBookSubject.trim()) { setIngestErrorMsg('Please specify a Subject for the new book.'); toast.warning('Please specify a Subject for the new book.'); return; }
      if (!newChapterTitle.trim()) { setIngestErrorMsg('Please enter a Chapter Title.'); toast.warning('Please enter a Chapter Title.'); return; }
      if (!newTopicName.trim()) { setIngestErrorMsg('Please enter a Topic Name.'); toast.warning('Please enter a Topic Name.'); return; }
    } else if (isNewChapter) {
      if (!newChapterTitle.trim()) { setIngestErrorMsg('Please enter a Chapter Title.'); toast.warning('Please enter a Chapter Title.'); return; }
      if (!newTopicName.trim()) { setIngestErrorMsg('Please enter a Topic Name.'); toast.warning('Please enter a Topic Name.'); return; }
    } else if (isNewTopic) {
      if (!newTopicName.trim()) { setIngestErrorMsg('Please enter a Topic Name.'); toast.warning('Please enter a Topic Name.'); return; }
    } else if (!selectedTopicId || selectedTopicId === 'NEW') {
      setIngestErrorMsg('Please select an existing Topic or create a new one.'); toast.warning('Please select an existing Topic or create a new one.'); return;
    }
    if (!questionText.trim()) { setIngestErrorMsg('Question text is required.'); toast.warning('Question text is required.'); return; }
    if (!correctAnswer.trim()) { setIngestErrorMsg('Correct answer is required.'); toast.warning('Correct answer is required.'); return; }
    let formattedOptions: Record<string, string> | null = null;
    if (['MCQ', 'MSQ', 'MATCH_THE_FOLLOWING'].includes(questionType)) {
      formattedOptions = {};
      options.forEach((opt) => { if (opt.text.trim()) formattedOptions![opt.key] = opt.text.trim(); });
    }
    const payload: IngestQuestionPayload = {
      question_text: questionText.trim(), question_type: questionType, marks, difficulty,
      learner_level: learnerLevel, bank_source: isDEO ? 'ORGANIZATION' : 'GLOBAL', submit: true,
      options: formattedOptions, correct_answer: correctAnswer.trim(),
      explanation: explanation.trim(), source_reference: sourceReference.trim(),
      variants: variants.filter((v) => v.question_text.trim()).map((v) => {
        let variantOptions: Record<string, string> | undefined;
        if (v.variant_type === 'MCQ' && v.options) { variantOptions = {}; v.options.forEach((opt) => { if (opt.text.trim()) variantOptions![opt.key] = opt.text.trim(); }); }
        return { variant_type: v.variant_type, marks: v.marks, question_text: v.question_text.trim(), options: variantOptions, correct_answer: v.correct_answer.trim(), explanation: v.explanation.trim() };
      }),
    };
    if (!isNewBook && selectedBookId && selectedBookId !== 'NEW') {
      if (!isNewChapter && selectedChapterId && selectedChapterId !== 'NEW') {
        if (!isNewTopic && (selectedTopicId || selectedTopicIds.length > 0) && selectedTopicId !== 'NEW') {
          payload.topic = selectedTopicIds.length > 0 ? selectedTopicIds[0] : Number(selectedTopicId);
          payload.topic_ids = selectedTopicIds.length > 0 ? selectedTopicIds : [Number(selectedTopicId)];
        } else { payload.topic = null; payload.chapter_id = Number(selectedChapterId); payload.topic_name = newTopicName.trim(); }
      } else { payload.topic = null; payload.book_id = Number(selectedBookId); payload.chapter_title = newChapterTitle.trim(); payload.topic_name = newTopicName.trim(); }
    } else {
      payload.topic = null; payload.board = effectiveBoard;
      payload.book_title = newBookTitle.trim() || `${newBookSubject.trim()} (${newBookGrade.trim()})`;
      payload.subject = newBookSubject.trim(); payload.grade = newBookGrade.trim();
      payload.chapter_title = newChapterTitle.trim(); payload.topic_name = newTopicName.trim();
    }
    setIsSubmitting(true);
    try {
      const created = await contentApi.ingestQuestion(payload);
      const successText = `Question #${created.id} and ${created.variants?.length || variants.length} variant(s) successfully ingested into ${created.school ? 'School Question Bank' : 'the Global Question Bank'}!`;
      setIngestSuccessMsg(successText); toast.success(successText);
      setQuestionText(''); setExplanation(''); setSourceReference(''); setVariants([]);
      const updatedBoards = await contentApi.getBoards().catch(() => boards); setBoards(updatedBoards);
      if (isNewBoard) { setIsNewBoard(false); setSelectedBoard(effectiveBoard); }
      const updatedBooks = await contentApi.getBooks(effectiveBoard).catch(() => []); setBooks(updatedBooks);
      if (isNewBook) {
        const targetBookTitle = (newBookTitle.trim() || `${newBookSubject.trim()} (${newBookGrade.trim()})`).toLowerCase();
        const createdBook = updatedBooks.find((b) => b.title.toLowerCase() === targetBookTitle) || updatedBooks[updatedBooks.length - 1];
        if (createdBook) {
          setSelectedBookId(createdBook.id); setIsNewBook(false);
          const chaps = await contentApi.getChapters(createdBook.id).catch(() => []); setChapters(chaps);
          const createdChap = chaps.find((c) => c.title.toLowerCase() === newChapterTitle.trim().toLowerCase()) || chaps[chaps.length - 1];
          if (createdChap) {
            setSelectedChapterId(createdChap.id); setIsNewChapter(false);
            const tops = await contentApi.getTopics(createdChap.id).catch(() => []); setTopics(tops);
            if (created.topic) setSelectedTopicId(created.topic); else if (tops.length > 0) setSelectedTopicId(tops[tops.length - 1].id);
            setIsNewTopic(false);
          }
        }
      } else if (isNewChapter && selectedBookId && selectedBookId !== 'NEW') {
        const chaps = await contentApi.getChapters(Number(selectedBookId)).catch(() => []); setChapters(chaps);
        const createdChap = chaps.find((c) => c.title.toLowerCase() === newChapterTitle.trim().toLowerCase()) || chaps[chaps.length - 1];
        if (createdChap) {
          setSelectedChapterId(createdChap.id); setIsNewChapter(false);
          const tops = await contentApi.getTopics(createdChap.id).catch(() => []); setTopics(tops);
          if (created.topic) setSelectedTopicId(created.topic); else if (tops.length > 0) setSelectedTopicId(tops[tops.length - 1].id);
          setIsNewTopic(false);
        }
      } else if (isNewTopic && selectedChapterId && selectedChapterId !== 'NEW') {
        const tops = await contentApi.getTopics(Number(selectedChapterId)).catch(() => []); setTopics(tops);
        if (created.topic) setSelectedTopicId(created.topic); else if (tops.length > 0) setSelectedTopicId(tops[tops.length - 1].id);
        setIsNewTopic(false);
      }
      loadQuestions(); loadStats();
    } catch (err: any) {
      const errText = err.response?.data?.detail || (err.response?.data && typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : 'Failed to ingest question.');
      setIngestErrorMsg(errText); toast.error(errText);
    } finally { setIsSubmitting(false); }
  };

  const handleQuickVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVariantModalQuestion) return;
    if (!quickVariantText.trim() || !quickVariantAnswer.trim()) { toast.warning('Variant question text and answer are required.'); return; }
    let quickOptionsMap: Record<string, string> | undefined;
    if (quickVariantType === 'MCQ') { quickOptionsMap = {}; quickVariantOptions.forEach((opt) => { if (opt.text.trim()) quickOptionsMap![opt.key] = opt.text.trim(); }); }
    setIsSubmittingQuickVariant(true);
    try {
      await contentApi.addVariant(quickVariantModalQuestion.id, {
        variant_type: quickVariantType as any, marks: quickVariantMarks, difficulty: quickVariantModalQuestion.difficulty,
        question_text: quickVariantText.trim(), options: quickOptionsMap, correct_answer: quickVariantAnswer.trim(), explanation: quickVariantExplanation.trim(),
      });
      toast.success('Variant successfully appended to question!');
      const refreshed = await contentApi.getQuestion(quickVariantModalQuestion.id);
      setSelectedQuestion(refreshed); setQuickVariantModalQuestion(null); setQuickVariantText(''); setQuickVariantAnswer(''); setQuickVariantExplanation('');
      loadQuestions(); loadStats();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to add variant.'); }
    finally { setIsSubmittingQuickVariant(false); }
  };

  return {
    isDEO, isValidator, isQBM,
    activeTab, setActiveTab,
    questions, totalCount, currentPage, setCurrentPage, pageSize, setPageSize,
    sortBy, isLoadingQuestions, searchTerm, setSearchTerm,
    filterBoard, filterType, filterDifficulty,
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
    isSubmitting, ingestSuccessMsg, setIngestSuccessMsg, ingestErrorMsg, handleIngestSubmit,
    quickVariantModalQuestion, setQuickVariantModalQuestion,
    quickVariantType, setQuickVariantType, quickVariantMarks, setQuickVariantMarks,
    quickVariantText, setQuickVariantText, quickVariantAnswer, setQuickVariantAnswer,
    quickVariantExplanation, setQuickVariantExplanation,
    quickVariantOptions, isSubmittingQuickVariant,
    addQuickVariantOption, removeQuickVariantOption, updateQuickVariantOption, handleQuickVariantSubmit,
  };
}
