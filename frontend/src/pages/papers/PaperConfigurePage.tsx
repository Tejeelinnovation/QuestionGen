import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../api/content';
import { papersApi, type SelectQuestionsConstraints } from '../../api/papers';
import type { Paper, Topic } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useToast } from '../../context/ToastContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { extractApiErrorMessage } from '../../utils/errorUtils';
import { PaperConfigurePageTablet } from '../tablet/papers/PaperConfigurePageTablet';
import { PaperConfigurePageMobile } from '../mobile/papers/PaperConfigurePageMobile';
import { MOTION } from '../../lib/motion';
import { Clock, CheckCircle2, Plus, Trash2, Sliders } from 'lucide-react';

export interface MarkTierConfig {
  id: string;
  marks: number;
  count: number;
  question_types: string[];
}

const DEFAULT_TIERS: MarkTierConfig[] = [
  { id: 'tier-1', marks: 1, count: 5, question_types: ['MCQ', 'FILL_IN_THE_BLANKS'] },
  { id: 'tier-2', marks: 2, count: 5, question_types: ['SHORT_ANSWER'] },
  { id: 'tier-3', marks: 3, count: 3, question_types: ['SHORT_ANSWER'] },
  { id: 'tier-4', marks: 4, count: 2, question_types: ['LONG_ANSWER'] },
  { id: 'tier-5', marks: 5, count: 1, question_types: ['LONG_ANSWER'] },
];

const AVAILABLE_QUESTION_FORMATS = [
  { value: 'MCQ', label: 'MCQ' },
  { value: 'MSQ', label: 'MSQ' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'LONG_ANSWER', label: 'Long Answer' },
  { value: 'FILL_IN_THE_BLANKS', label: 'Fill in Blanks' },
  { value: 'ONE_WORD', label: 'One Word' },
  { value: 'MATCH_THE_FOLLOWING', label: 'Match Following' },
  { value: 'DIAGRAM_BASED', label: 'Diagram' },
  { value: 'COMPREHENSION_BASED', label: 'Comprehension' },
];

const PaperConfigurePageDesktop: React.FC = () => {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD' | ''>('');
  const [learnerLevel, setLearnerLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | ''>('');
  const [questionType, setQuestionType] = useState<'MCQ' | 'SHORT_ANSWER' | 'LONG_ANSWER' | ''>('');
  const [marksPerQuestion] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<string>('37');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [quantity, setQuantity] = useState<string>('');

  // Rubric breakdown state
  const [useDistributionRubric, setUseDistributionRubric] = useState<boolean>(true);
  const [markTiers, setMarkTiers] = useState<MarkTierConfig[]>(DEFAULT_TIERS);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadPaperAndTopics = async () => {
      setIsLoading(true);
      try {
        const paperData = await papersApi.getPaper(paperId);
        setPaper(paperData);

        if (paperData.duration_minutes) {
          setDurationMinutes(paperData.duration_minutes);
        }

        if (paperData.chapter) {
          const topicsData = await contentApi.getTopics(paperData.chapter);
          setTopics(topicsData);
        } else {
          setTopics([]);
        }

        if (paperData.total_question_count && !quantity) {
          setQuantity(String(paperData.total_question_count));
        }
      } catch (err: any) {
        toast.error(
          err.response?.data?.detail || 'Failed to load paper details and curriculum topics.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId) {
      loadPaperAndTopics();
    }
  }, [paperId]);

  const handleTopicToggle = (topicId: number) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((tid) => tid !== topicId) : [...prev, topicId]
    );
  };

  const handleSelectAllTopics = () => {
    if (selectedTopicIds.length === topics.length) {
      setSelectedTopicIds([]);
    } else {
      setSelectedTopicIds(topics.map((t) => t.id));
    }
  };

  const rubricTotalMarks = markTiers.reduce(
    (acc, t) => acc + Number(t.count) * Number(t.marks),
    0
  );
  const rubricTotalQuestions = markTiers.reduce((acc, t) => acc + Number(t.count), 0);

  // Automatically count and synchronize Grand Total Marks from rubric formats and question counts
  useEffect(() => {
    if (useDistributionRubric) {
      setTotalMarks(String(rubricTotalMarks));
    }
  }, [rubricTotalMarks, useDistributionRubric]);

  const handleUpdateTierCount = (tierId: string, count: number) => {
    setMarkTiers((prev) =>
      prev.map((t) => (t.id === tierId ? { ...t, count: Math.max(0, count) } : t))
    );
  };

  const handleToggleTierFormat = (tierId: string, formatValue: string) => {
    setMarkTiers((prev) =>
      prev.map((t) => {
        if (t.id !== tierId) return t;
        const exists = t.question_types.includes(formatValue);
        const updated = exists
          ? t.question_types.filter((f) => f !== formatValue)
          : [...t.question_types, formatValue];
        return { ...t, question_types: updated };
      })
    );
  };

  const handleAddTier = () => {
    const existingMarks = markTiers.map((t) => t.marks);
    const nextMark = Math.max(...existingMarks, 0) + 1;
    const newTier: MarkTierConfig = {
      id: `tier-${Date.now()}`,
      marks: nextMark,
      count: 1,
      question_types: ['LONG_ANSWER'],
    };
    setMarkTiers((prev) => [...prev, newTier]);
  };

  const handleRemoveTier = (tierId: string) => {
    setMarkTiers((prev) => prev.filter((t) => t.id !== tierId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedTotalMarks = Number(totalMarks);
    if (!totalMarks || isNaN(parsedTotalMarks) || parsedTotalMarks <= 0) {
      toast.warning('Total marks is compulsory. Please specify the grand total marks for this examination.');
      return;
    }

    if (useDistributionRubric) {
      const activeTiers = markTiers.filter((t) => t.count > 0);
      if (activeTiers.length > 0 && rubricTotalMarks !== parsedTotalMarks) {
        toast.warning(
          `Rubric question distribution totals ${rubricTotalMarks} marks, which does not match compulsory Total Marks (${parsedTotalMarks}). Please balance your question counts or auto-adjust Total Marks.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (durationMinutes && durationMinutes !== paper?.duration_minutes) {
        await papersApi.updatePaper(paperId, { duration_minutes: Number(durationMinutes) });
      }

      const activeTiers = useDistributionRubric ? markTiers.filter((t) => t.count > 0) : [];
      const constraints: SelectQuestionsConstraints = {
        topic_ids: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
        difficulty: difficulty || undefined,
        learner_level: learnerLevel || undefined,
        question_type: !useDistributionRubric ? (questionType || undefined) : undefined,
        marks_per_question: marksPerQuestion ? Number(marksPerQuestion) : undefined,
        total_marks: parsedTotalMarks,
        quantity: quantity ? Number(quantity) : (activeTiers.length > 0 ? rubricTotalQuestions : undefined),
        subjects: paper?.subjects?.length ? paper.subjects : undefined,
        duration_minutes: Number(durationMinutes) || 60,
        mark_distribution: activeTiers.length > 0
          ? activeTiers.map((t) => ({
              marks: t.marks,
              count: t.count,
              question_types: t.question_types.length > 0 ? t.question_types : undefined,
            }))
          : undefined,
      };

      const candidateQuestions = await papersApi.selectQuestions(paperId, constraints);

      if (candidateQuestions.length === 0) {
        const warningMsg = 'No questions found matching the specified constraints. Try broadening your criteria or rubric tier counts.';
        toast.warning(warningMsg);
        setIsSubmitting(false);
        return;
      }

      toast.success(`Selected ${candidateQuestions.length} questions from question bank matching blueprint.`);

      const reviewPayload = {
        questions: candidateQuestions,
        constraints,
      };
      sessionStorage.setItem(`paper_${paperId}_review`, JSON.stringify(reviewPayload));

      navigate(`/papers/${paperId}/review`, { state: reviewPayload });
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to query candidate questions from the question bank.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PaperWorkflowNav currentStep="configure" paperId={paperId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60">
          Loading question bank filters and chapter parameters...
        </div>
      </div>
    );
  }

  const activeFilterCount = [
    selectedTopicIds.length > 0,
    difficulty !== '',
    questionType !== '',
    learnerLevel !== '',
    marksPerQuestion !== '',
    totalMarks !== '',
    quantity !== '',
  ].filter(Boolean).length;

  return (
    <div className="space-y-8">
      {/* Workflow Navigation */}
      <PaperWorkflowNav
        currentStep="configure"
        paperId={paperId}
        paperTitle={paper?.title}
        chapterTitle={paper?.chapter_title}
      />

      {/* Header section with asymmetric title */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Stage 02 • Algorithmic Question Filtering
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Configure Constraints
          </h1>
          <p className="font-body text-ink/70 text-sm max-w-2xl leading-relaxed">
            Apply Bloom’s taxonomy levels, syllabus topic filters, and mark quotas to assemble a candidate question set.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="pill pill-forest text-xs">
            {activeFilterCount} Active {activeFilterCount === 1 ? 'Constraint' : 'Constraints'}
          </span>
          <Link
            to={`/papers/${paperId}`}
            className="text-xs font-heading font-semibold text-ink/70 hover:text-ink px-3 py-1.5 rounded-pill border border-border bg-surface hover:bg-surface-muted transition-colors"
          >
            ← View Paper Info
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── SECTION 1: Interactive Filter Pills (Ref: 02_englishconnect_pills.jpg) ── */}
        <div className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-6">
          <div className="border-b border-border/80 pb-4 flex items-center justify-between">
            <div>
              <h2 className="font-heading font-bold text-lg text-ink">
                Taxonomy & Format Dimensions
              </h2>
              <p className="text-xs text-ink/60">
                Click interactive pills to adjust question characteristics
              </p>
            </div>
            <span className="font-mono text-[11px] text-ink/40 uppercase">Pill Filters</span>
          </div>

          {/* Hidden accessible selects for automation / test script compatibility */}
          <select
            id="filter-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as any)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          >
            <option value="">Any Difficulty</option>
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </select>

          <select
            id="filter-type"
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as any)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          >
            <option value="">Any Type</option>
            <option value="MCQ">MCQ</option>
            <option value="SHORT_ANSWER">SHORT_ANSWER</option>
            <option value="LONG_ANSWER">LONG_ANSWER</option>
          </select>

          <select
            id="filter-level"
            value={learnerLevel}
            onChange={(e) => setLearnerLevel(e.target.value as any)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          >
            <option value="">Any Level</option>
            <option value="BEGINNER">BEGINNER</option>
            <option value="INTERMEDIATE">INTERMEDIATE</option>
            <option value="ADVANCED">ADVANCED</option>
          </select>

          {/* Difficulty Pills */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80">
                Difficulty Level
              </span>
              <span className="font-mono text-[11px] text-ink/50">
                {difficulty ? `Selected: ${difficulty}` : 'Any Difficulty'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: '', label: 'Any Difficulty', accent: 'muted' },
                { value: 'EASY', label: 'Easy • Foundations', accent: 'forest' },
                { value: 'MEDIUM', label: 'Medium • Standard', accent: 'ember' },
                { value: 'HARD', label: 'Hard • Advanced Inquiry', accent: 'grape' },
              ].map((item) => {
                const isSelected = difficulty === item.value;
                let activeClass = 'bg-ink text-white';
                if (item.accent === 'forest') activeClass = 'bg-forest text-white border-forest';
                if (item.accent === 'ember') activeClass = 'bg-ember text-white border-ember';
                if (item.accent === 'grape') activeClass = 'bg-grape text-white border-grape';

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDifficulty(item.value as any)}
                    disabled={isSubmitting}
                    className={`px-4 py-2 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer ${
                      isSelected
                        ? `${activeClass} shadow-sm scale-102`
                        : 'border-border bg-bg text-ink hover:bg-surface-muted hover:border-border-strong'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Type Pills */}
          <div className="space-y-2.5 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80">
                Question Format
              </span>
              <span className="font-mono text-[11px] text-ink/50">
                {questionType ? `Selected: ${questionType}` : 'All Formats'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: '', label: 'All Question Types', accent: 'muted' },
                { value: 'MCQ', label: 'Multiple Choice (MCQ)', accent: 'forest' },
                { value: 'SHORT_ANSWER', label: 'Short Answer', accent: 'ember' },
                { value: 'LONG_ANSWER', label: 'Long Answer / Descriptive', accent: 'grape' },
              ].map((item) => {
                const isSelected = questionType === item.value;
                let activeClass = 'bg-ink text-white';
                if (item.accent === 'forest') activeClass = 'bg-forest text-white border-forest';
                if (item.accent === 'ember') activeClass = 'bg-ember text-white border-ember';
                if (item.accent === 'grape') activeClass = 'bg-grape text-white border-grape';

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setQuestionType(item.value as any)}
                    disabled={isSubmitting}
                    className={`px-4 py-2 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer ${
                      isSelected
                        ? `${activeClass} shadow-sm scale-102`
                        : 'border-border bg-bg text-ink hover:bg-surface-muted hover:border-border-strong'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Learner Level Pills */}
          <div className="space-y-2.5 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80">
                Learner Cognitive Level
              </span>
              <span className="font-mono text-[11px] text-ink/50">
                {learnerLevel ? `Selected: ${learnerLevel}` : 'Any Level'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: '', label: 'Any Learner Level', accent: 'muted' },
                { value: 'BEGINNER', label: 'Beginner • Recall & Comprehension', accent: 'forest' },
                { value: 'INTERMEDIATE', label: 'Intermediate • Application & Analysis', accent: 'ember' },
                { value: 'ADVANCED', label: 'Advanced • Synthesis & Evaluation', accent: 'grape' },
              ].map((item) => {
                const isSelected = learnerLevel === item.value;
                let activeClass = 'bg-ink text-white';
                if (item.accent === 'forest') activeClass = 'bg-forest text-white border-forest';
                if (item.accent === 'ember') activeClass = 'bg-ember text-white border-ember';
                if (item.accent === 'grape') activeClass = 'bg-grape text-white border-grape';

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setLearnerLevel(item.value as any)}
                    disabled={isSubmitting}
                    className={`px-4 py-2 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer ${
                      isSelected
                        ? `${activeClass} shadow-sm scale-102`
                        : 'border-border bg-bg text-ink hover:bg-surface-muted hover:border-border-strong'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Question Format & Mark Rubric Distribution Builder ── */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-forest" />
                <h3 className="font-heading font-bold text-base text-ink">
                  Question Format & Mark Rubric Distribution
                </h3>
              </div>
              <p className="text-xs text-ink/65 mt-0.5">
                Define question counts and allowed formats for each mark tier (1-mark, 2-mark, 3-mark, 4-mark, 5-mark, etc.)
              </p>
            </div>

            <div className="flex items-center gap-2 bg-bg px-2.5 py-1 rounded-card border border-border text-xs self-start sm:self-auto">
              <span className="text-ink/60 font-medium">Mode:</span>
              <button
                type="button"
                onClick={() => setUseDistributionRubric(true)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  useDistributionRubric
                    ? 'bg-forest text-white shadow-xs'
                    : 'text-ink/60 hover:text-ink'
                }`}
              >
                Structured Rubric
              </button>
              <button
                type="button"
                onClick={() => setUseDistributionRubric(false)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  !useDistributionRubric
                    ? 'bg-forest text-white shadow-xs'
                    : 'text-ink/60 hover:text-ink'
                }`}
              >
                Flexible Solver
              </button>
            </div>
          </div>

          {useDistributionRubric ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {markTiers.map((tier) => {
                  const tierSubtotal = tier.count * tier.marks;
                  return (
                    <div
                      key={tier.id}
                      className="p-4 rounded-card border border-border bg-bg/60 hover:bg-surface transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      {/* Left: Mark badge & question count */}
                      <div className="flex items-center gap-4 min-w-[200px]">
                        <div className="w-16 h-10 rounded-card bg-forest/10 border border-forest/30 flex flex-col items-center justify-center shrink-0">
                          <span className="font-heading font-bold text-sm text-forest">
                            {tier.marks} {tier.marks === 1 ? 'Mark' : 'Marks'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-heading font-semibold uppercase tracking-wider text-ink/70">
                            Question Count
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={tier.count}
                              onChange={(e) => handleUpdateTierCount(tier.id, Number(e.target.value))}
                              className="w-20 rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs font-mono font-bold text-ink focus:border-forest focus:outline-none"
                            />
                            <span className="text-xs text-ink/50">Qs</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Allowed question formats multi-select */}
                      <div className="flex-1 space-y-1">
                        <label className="block text-[11px] font-heading font-semibold uppercase tracking-wider text-ink/70">
                          Allowed Formats for {tier.marks}-Marker Questions:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {AVAILABLE_QUESTION_FORMATS.map((fmt) => {
                            const isSelected = tier.question_types.includes(fmt.value);
                            return (
                              <button
                                key={fmt.value}
                                type="button"
                                onClick={() => handleToggleTierFormat(tier.id, fmt.value)}
                                className={`px-2 py-0.5 rounded text-[11px] font-heading transition-colors cursor-pointer border ${
                                  isSelected
                                    ? 'bg-forest text-white border-forest font-semibold'
                                    : 'bg-surface text-ink/65 border-border hover:border-border-strong'
                                }`}
                              >
                                {isSelected ? '✓ ' : '+ '}
                                {fmt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Subtotal and delete */}
                      <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-2 md:pt-0 border-border">
                        <div className="text-right">
                          <span className="text-[10px] text-ink/50 block font-mono">Tier Subtotal</span>
                          <span className="font-heading font-bold text-sm text-ink">
                            {tierSubtotal} Marks
                          </span>
                        </div>

                        {markTiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(tier.id)}
                            className="p-1.5 text-ink/40 hover:text-ember transition-colors cursor-pointer rounded"
                            title="Remove this mark tier"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddTier}
                  className="px-3 py-1.5 rounded-pill border border-dashed border-border hover:border-forest text-xs font-heading font-semibold text-ink/70 hover:text-forest flex items-center gap-1.5 transition-colors cursor-pointer self-start"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Custom Mark Tier</span>
                </button>

                {/* Rubric Status Banner */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-mono text-ink/70">
                    Rubric Total: <strong>{rubricTotalQuestions} Questions</strong> ({rubricTotalMarks} Marks)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Grand Total Auto-Counted ({rubricTotalMarks} Marks)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink/60 bg-bg p-4 rounded-card border border-border">
              Flexible Solver mode selected. The knapsack algorithm will automatically draw questions of varying mark values from the question bank to reach your target total marks.
            </p>
          )}
        </div>

        {/* ── SECTION 3: Syllabus Scope & Examination Parameters ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Scope Selector: Multi-Subject vs Chapter Topics (7 cols) */}
          <div className="lg:col-span-7 bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            {paper?.subjects && paper.subjects.length > 0 ? (
              <div className="space-y-4">
                <div className="border-b border-border/80 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-base text-ink">
                      Multi-Subject Examination Scope
                    </h3>
                    <p className="text-xs text-ink/60">
                      Sampling candidate questions across registered disciplines
                    </p>
                  </div>
                  <span className="pill pill-forest text-[10px]">
                    Combined Blueprint
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {paper.subjects.map((subj) => (
                    <div
                      key={subj}
                      className="px-3.5 py-2 rounded-card border border-forest/30 bg-forest/5 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-forest" />
                      <span className="font-heading font-semibold text-xs text-ink">
                        {subj}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-card bg-bg border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink/60 font-medium">Multi-Source Question Banks:</span>
                    <span className="font-mono font-semibold text-forest">Global QBM + School Private Bank</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink/60 font-medium">Configured Exam Duration:</span>
                    <span className="font-mono font-semibold text-ink">{durationMinutes} Minutes</span>
                  </div>
                </div>

                <p className="text-[11px] text-ink/50 leading-relaxed">
                  Questions will be automatically balanced across all participating subjects and difficulty criteria while strictly enforcing organization privacy isolation.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border/80 pb-3">
                  <div>
                    <h3 className="font-heading font-bold text-base text-ink">
                      Syllabus Topic Coverage
                    </h3>
                    <p className="text-xs text-ink/60">
                      Select specific syllabus topics or leave all unselected for full chapter inclusion
                    </p>
                  </div>

                  {topics.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllTopics}
                      className="text-xs font-heading font-semibold text-forest hover:underline cursor-pointer"
                    >
                      {selectedTopicIds.length === topics.length ? 'Deselect All' : 'Select All Topics'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {topics.map((t) => {
                    const isChecked = selectedTopicIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`p-3 rounded-card border text-left flex items-start gap-2.5 cursor-pointer transition-all ${
                          isChecked
                            ? 'border-forest bg-forest/5 text-ink'
                            : 'border-border bg-bg text-ink/80 hover:bg-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTopicToggle(t.id)}
                          disabled={isSubmitting}
                          className="mt-0.5 rounded text-forest focus:ring-forest accent-forest"
                        />
                        <div className="flex-1 text-xs">
                          <div className="font-heading font-semibold leading-tight">
                            {t.name}
                          </div>
                          <div className="font-mono text-[10px] text-ink/50 mt-1">
                            {t.question_count} candidate {t.question_count === 1 ? 'question' : 'questions'}
                          </div>
                        </div>
                      </label>
                    );
                  })}

                  {topics.length === 0 && (
                    <div className="col-span-2 text-center py-6 text-xs text-ink/50 italic">
                      No syllabus topics mapped for this chapter.
                    </div>
                  )}
                </div>

                <div className="pt-2 text-[11px] font-mono text-ink/60 flex items-center justify-between border-t border-border/60">
                  <span>Selected Scope:</span>
                  <span className="font-bold text-forest">
                    {selectedTopicIds.length === 0
                      ? `Full Chapter (${topics.length} topics included)`
                      : `${selectedTopicIds.length} of ${topics.length} topics selected`}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Right Column (5 cols): Exam Timing & Quantitative Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div className="font-heading font-bold text-base text-ink">
              Examination Parameters
            </div>

            {/* Exam Timing Card */}
            <div className={`bg-surface border border-border rounded-card p-5 shadow-card space-y-3 ${MOTION.hoverLift.className}`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="exam-duration-input"
                  className="font-heading text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5 text-forest" />
                  <span>Exam Duration (Minutes) *</span>
                </label>
                <span className="pill pill-forest text-[10px] font-mono font-bold">{durationMinutes} min</span>
              </div>
              <input
                id="exam-duration-input"
                type="number"
                min={1}
                max={600}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-sm font-mono text-ink focus:bg-surface focus:border-forest focus:outline-none"
                required
              />
              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {[30, 45, 60, 90, 120, 180].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-pill border transition-colors cursor-pointer ${
                      durationMinutes === mins
                        ? 'bg-forest text-white border-forest font-bold'
                        : 'bg-surface text-ink/60 border-border hover:text-ink'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink/50">
                Duration is saved to the paper and enforces the countdown timer for students sitting this test.
              </p>
            </div>

            {/* Compulsory Grand Total Marks Card */}
            <div className={`bg-surface border border-border rounded-card p-5 shadow-card space-y-2.5 ${MOTION.hoverLift.className}`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="filter-total-marks"
                  className="font-heading text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5"
                >
                  <span>Grand Total Marks *</span>
                  {useDistributionRubric ? (
                    <span className="text-forest font-bold text-[10px] uppercase">(Auto-Counted)</span>
                  ) : (
                    <span className="text-ember font-bold text-[10px] uppercase">(Compulsory)</span>
                  )}
                </label>
                {useDistributionRubric ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold font-mono">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Auto-Counted
                  </span>
                ) : (
                  <span className="pill pill-ember text-[10px] font-bold">Required</span>
                )}
              </div>
              <input
                id="filter-total-marks"
                type="number"
                min={1}
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
                placeholder={useDistributionRubric ? String(rubricTotalMarks) : "e.g. 25, 50, 80 or 100"}
                disabled={isSubmitting}
                required
                className={`w-full rounded-card border px-3.5 py-2 text-sm font-mono font-bold text-ink focus:outline-none transition-all ${
                  useDistributionRubric
                    ? 'border-emerald-300 bg-emerald-50/25 focus:border-forest focus:bg-surface'
                    : 'border-border bg-bg placeholder:text-ink/40 focus:bg-surface focus:border-ember'
                }`}
              />
              <p className="text-[11px] text-ink/60">
                {useDistributionRubric ? (
                  <>
                    Automatically counted from your question format & rubric breakdown: <strong className="text-ink">{rubricTotalQuestions} questions</strong> = <strong className="text-forest">{rubricTotalMarks} marks</strong>.
                  </>
                ) : (
                  'Compulsory total score for this test. All questions generated must sum to this exact mark.'
                )}
              </p>
            </div>

            {/* Max Question Cap (Optional) */}
            <div className={`bg-surface border border-border rounded-card p-5 shadow-card space-y-2 ${MOTION.hoverLift.className}`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="filter-quantity"
                  className="font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                >
                  Question Volume Cap
                </label>
                <span className="pill pill-grape text-[10px]">Optional</span>
              </div>
              <input
                id="filter-quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={useDistributionRubric ? `${rubricTotalQuestions} (from rubric)` : 'e.g. 25'}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-grape focus:outline-none"
              />
              <p className="text-[11px] text-ink/50">
                Optional ceiling on questions. In rubric mode, question count is determined by your rubric tiers.
              </p>
            </div>
          </div>
        </div>

        {/* ── Action Toolbar & Submission Bar ── */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-heading font-bold text-sm text-ink">
              Ready to Query Question Bank
            </div>
            <div className="text-xs text-ink/60">
              Next stage lets you sequence, reorder, and review each selected question before locking into a version.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/papers/${paperId}`}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              id="select-questions-submit-btn"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <span>{isSubmitting ? 'Querying Question Bank...' : 'Select & Review Questions'}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export const PaperConfigurePage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <PaperConfigurePageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <PaperConfigurePageTablet key="tablet" />;
  }
  return <PaperConfigurePageDesktop key="desktop" />;
};

