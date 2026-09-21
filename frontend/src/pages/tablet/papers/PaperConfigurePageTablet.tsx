import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi, type SelectQuestionsConstraints } from '../../../api/papers';
import type { Paper, Topic } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';
import { useToast } from '../../../context/ToastContext';
import {
  Clock,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { MOTION } from '../../../lib/motion';

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

export const PaperConfigurePageTablet: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD' | ''>('');
  const [questionType, setQuestionType] = useState<'MCQ' | 'SHORT_ANSWER' | 'LONG_ANSWER' | ''>('');
  const [learnerLevel, setLearnerLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | ''>('');

  // Rubric breakdown state
  const [useDistributionRubric, setUseDistributionRubric] = useState<boolean>(true);
  const [markTiers, setMarkTiers] = useState<MarkTierConfig[]>(DEFAULT_TIERS);
  const [totalMarks, setTotalMarks] = useState<string>('37');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [quantity, setQuantity] = useState<string>('');

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
        const msg = err.response?.data?.detail || 'Failed to load paper details and curriculum topics.';
        toast.error(msg);
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
        toast.warning(
          'No questions found matching the specified constraints. Try broadening your criteria or rubric tier counts.'
        );
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
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to query candidate questions from the question bank.';
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="configure" paperId={paperId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60 text-sm">
          Loading question bank filters...
        </div>
      </div>
    );
  }

  const isMarksMatching = Number(totalMarks) === rubricTotalMarks;

  return (
    <div className="space-y-6 font-body pb-16">
      <PaperWorkflowNavTablet
        currentStep="configure"
        paperId={paperId}
        paperTitle={paper?.title}
        chapterTitle={paper?.chapter_title}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Stage 02 • Constraints & Rubric
          </div>
          <h1 className="font-heading font-bold text-3xl text-ink tracking-tight mt-1">
            Question Format & Mark Rubric
          </h1>
          <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
            Define question counts and allowed formats for each mark tier (1, 2, 3, 4, 5-marker).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUseDistributionRubric(!useDistributionRubric)}
            className={`px-3.5 py-2 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer ${
              useDistributionRubric
                ? 'bg-forest text-white shadow-2xs'
                : 'bg-surface border border-border text-ink/70'
            }`}
          >
            {useDistributionRubric ? 'Mode: Structured Rubric' : 'Mode: Flexible Solver'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── SECTION: Taxonomy & Format Dimensions (Pill Filters) ── */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-card space-y-5">
          <div className="border-b border-border/80 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-heading font-bold text-base text-ink">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80">
                Difficulty Level
              </span>
              <span className="font-mono text-xs text-ink/50">
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
                    className={`px-3.5 py-1.5 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer ${
                      isSelected
                        ? `${activeClass} shadow-xs font-semibold`
                        : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Type Pills */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80">
                Question Format
              </span>
              <span className="font-mono text-xs text-ink/50">
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
                    className={`px-3.5 py-1.5 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer ${
                      isSelected
                        ? `${activeClass} shadow-xs font-semibold`
                        : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Learner Cognitive Level */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80">
                Learner Cognitive Level
              </span>
              <span className="font-mono text-xs text-ink/50">
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
                    className={`px-3.5 py-1.5 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer ${
                      isSelected
                        ? `${activeClass} shadow-xs font-semibold`
                        : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── QUESTION FORMAT & MARK RUBRIC DISTRIBUTION CARD ── */}
        {useDistributionRubric && (
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="font-heading font-bold text-lg text-ink">
                  Mark Tier Allocations & Format Selection
                </h2>
                <p className="text-xs text-ink/65">
                  Specify how many questions of each mark value and their permissible question styles.
                </p>
              </div>

              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border text-xs font-semibold ${
                  isMarksMatching
                    ? 'bg-forest/10 border-forest/30 text-forest'
                    : 'bg-ember/10 border-ember/30 text-ember'
                }`}
              >
                {isMarksMatching ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Matches Target Total Marks ({totalMarks})</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>
                      Rubric: {rubricTotalMarks}M ≠ Total: {totalMarks || 0}M
                    </span>
                    <button
                      type="button"
                      onClick={() => setTotalMarks(String(rubricTotalMarks))}
                      className="ml-1 text-[11px] underline font-bold cursor-pointer"
                    >
                      Sync
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Mark Tiers List */}
            <div className="space-y-3">
              {markTiers.map((tier) => {
                const subtotal = Number(tier.count) * Number(tier.marks);
                return (
                  <div
                    key={tier.id}
                    className="p-4 rounded-card bg-bg border border-border flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Mark Badge & Count */}
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-10 rounded-card bg-surface border border-border font-heading font-bold text-xs flex items-center justify-center text-ink shrink-0">
                        {tier.marks} {tier.marks === 1 ? 'Mark' : 'Marks'}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-ink/60 uppercase">Count:</span>
                        <input
                          type="number"
                          min="0"
                          value={tier.count}
                          onChange={(e) =>
                            handleUpdateTierCount(tier.id, parseInt(e.target.value) || 0)
                          }
                          className="w-14 px-2 py-1.5 rounded-card border border-border bg-surface text-xs font-mono font-bold text-ink text-center"
                        />
                        <span className="text-xs text-ink/50">Qs</span>
                      </div>
                    </div>

                    {/* Formats Pills */}
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-ink/50 block">
                        Allowed Formats:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {AVAILABLE_QUESTION_FORMATS.map((fmt) => {
                          const isSelected = tier.question_types.includes(fmt.value);
                          return (
                            <button
                              key={fmt.value}
                              type="button"
                              onClick={() => handleToggleTierFormat(tier.id, fmt.value)}
                              className={`px-2.5 py-1 rounded text-xs font-heading transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-forest text-white font-bold'
                                  : 'bg-surface border border-border text-ink/70 hover:bg-surface-muted'
                              }`}
                            >
                              {isSelected ? `✓ ${fmt.label}` : `+ ${fmt.label}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Subtotal & Remove */}
                    <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-ink/50 block uppercase font-mono">Subtotal</span>
                        <span className="font-heading font-bold text-sm text-forest">
                          {subtotal} Marks
                        </span>
                      </div>

                      {markTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(tier.id)}
                          className="p-1.5 text-ink/40 hover:text-ember transition-colors cursor-pointer"
                          title="Remove tier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAddTier}
                  className="px-4 py-2 rounded-pill border border-dashed border-border hover:border-forest text-xs font-heading font-semibold text-ink hover:text-forest transition-colors flex items-center gap-1.5 cursor-pointer bg-surface"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Custom Mark Tier</span>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-mono text-xs text-ink/70">
                    Rubric Total: <strong>{rubricTotalQuestions} Questions</strong> ({rubricTotalMarks} Marks)
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Auto-Counted
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 2-COLUMN REFIGHT: TOPICS (LEFT) & EXAMINATION PARAMETERS (RIGHT) ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: Syllabus Topic Coverage */}
          <div className="md:col-span-7 bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="font-heading font-bold text-base text-ink">
                  Syllabus Topic Coverage
                </h2>
                <p className="text-xs text-ink/65">
                  Select specific syllabus topics or leave all unselected for full chapter coverage
                </p>
              </div>

              <button
                type="button"
                onClick={handleSelectAllTopics}
                className="text-xs font-semibold text-forest hover:underline cursor-pointer"
              >
                {selectedTopicIds.length === topics.length ? 'Deselect All' : 'Select All Topics'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
              {topics.map((t) => {
                const isChecked = selectedTopicIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    onClick={() => handleTopicToggle(t.id)}
                    className={`p-3 rounded-card border text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                      isChecked
                        ? 'bg-forest/5 border-forest/40 text-forest font-semibold shadow-2xs'
                        : 'bg-bg border-border text-ink hover:bg-surface-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded accent-forest w-3.5 h-3.5"
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Right Column: Examination Parameters (Duration & Total Marks) */}
          <div className="md:col-span-5 bg-surface border border-border rounded-card p-6 shadow-card space-y-5">
            <div className="border-b border-border pb-3">
              <h2 className="font-heading font-bold text-base text-ink">
                Examination Parameters
              </h2>
              <p className="text-xs text-ink/65">
                Saved to paper blueprint and enforced during online test delivery
              </p>
            </div>

            {/* Exam Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-forest" />
                  <span>Exam Duration (Minutes) *</span>
                </label>
                <span className="pill pill-forest text-[11px] font-mono">{durationMinutes} min</span>
              </div>

              <input
                type="number"
                required
                min="5"
                max="360"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                className="w-full px-3 py-2 text-xs rounded-card border border-border bg-bg text-ink font-mono font-semibold focus:border-forest focus:outline-hidden"
              />

              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[30, 45, 60, 90, 120, 180].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={`px-2.5 py-1 rounded-pill text-[11px] font-mono transition-all cursor-pointer ${
                      durationMinutes === mins
                        ? 'bg-forest text-white font-bold'
                        : 'bg-surface-muted border border-border text-ink/70'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Grand Total Marks */}
            <div className="space-y-1.5 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
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
                  <span className="pill pill-ember text-[10px] uppercase font-mono">Required</span>
                )}
              </div>

              <input
                type="number"
                required
                min="1"
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
                placeholder={useDistributionRubric ? String(rubricTotalMarks) : "e.g. 37, 50, 80"}
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-card border transition-all ${
                  useDistributionRubric
                    ? 'border-emerald-300 bg-emerald-50/25 text-ink focus:border-forest focus:bg-surface'
                    : 'border-border bg-bg text-ink focus:border-forest'
                } focus:outline-hidden`}
              />
              <p className="text-[10px] text-ink/60">
                {useDistributionRubric ? (
                  <>
                    Automatically counted from your question format & rubric breakdown: <strong className="text-ink">{rubricTotalQuestions} questions</strong> = <strong className="text-forest">{rubricTotalMarks} marks</strong>.
                  </>
                ) : (
                  'Compulsory total score for this test. All questions generated must sum to this exact mark.'
                )}
              </p>
            </div>

            {/* Question Volume Cap */}
            <div className="space-y-1.5 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink">Question Volume Cap</label>
                <span className="pill pill-muted text-[10px] uppercase font-mono">Optional</span>
              </div>

              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={useDistributionRubric ? `${rubricTotalQuestions} (from rubric)` : 'e.g. 20'}
                className="w-full px-3 py-2 text-xs font-mono rounded-card border border-border bg-bg text-ink focus:border-forest focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`py-3 px-6 rounded-pill bg-forest text-white font-heading font-bold text-xs hover:bg-forest/90 transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 ${MOTION.touch.button.className}`}
          >
            {isSubmitting ? (
              <span>Querying Question Bank...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  Generate & Review Questions ({useDistributionRubric ? rubricTotalQuestions : totalMarks} Qs) &rarr;
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
