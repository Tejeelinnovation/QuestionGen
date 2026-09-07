import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../api/content';
import { papersApi, type SelectQuestionsConstraints } from '../../api/papers';
import type { Paper, Topic } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { PaperConfigurePageTablet } from '../tablet/papers/PaperConfigurePageTablet';

export const PaperConfigurePage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'tablet') {
    return <PaperConfigurePageTablet />;
  }

  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD' | ''>('');
  const [learnerLevel, setLearnerLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | ''>('');
  const [questionType, setQuestionType] = useState<'MCQ' | 'SHORT_ANSWER' | 'LONG_ANSWER' | ''>('');
  const [marksPerQuestion, setMarksPerQuestion] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadPaperAndTopics = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const paperData = await papersApi.getPaper(paperId);
        setPaper(paperData);

        const topicsData = await contentApi.getTopics(paperData.chapter);
        setTopics(topicsData);
      } catch (err: any) {
        setErrorMessage(
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const constraints: SelectQuestionsConstraints = {
      topic_ids: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
      difficulty: difficulty || undefined,
      learner_level: learnerLevel || undefined,
      question_type: questionType || undefined,
      marks_per_question: marksPerQuestion ? Number(marksPerQuestion) : undefined,
      total_marks: totalMarks ? Number(totalMarks) : undefined,
      quantity: quantity ? Number(quantity) : undefined,
    };

    setIsSubmitting(true);
    try {
      const candidateQuestions = await papersApi.selectQuestions(paperId, constraints);

      if (candidateQuestions.length === 0) {
        setErrorMessage(
          'No questions found matching the specified constraints in this chapter. Try broadening your criteria.'
        );
        setIsSubmitting(false);
        return;
      }

      const reviewPayload = {
        questions: candidateQuestions,
        constraints,
      };
      sessionStorage.setItem(`paper_${paperId}_review`, JSON.stringify(reviewPayload));

      navigate(`/papers/${paperId}/review`, { state: reviewPayload });
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to query candidate questions from the question bank.';
      setErrorMessage(detail);
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

      {errorMessage && (
        <div
          id="configure-error-banner"
          className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium flex items-start gap-2"
        >
          <span className="font-bold text-sm">!</span>
          <span>{errorMessage}</span>
        </div>
      )}

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

        {/* ── SECTION 2 & 3: Staggered Constraints & Topics Split (Ref: 11_jobstobe_staggered_cards.jpg) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Topics Multi-Select (7 cols) */}
          <div className="lg:col-span-7 bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
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
                    className={`p-3 rounded-card border transition-all cursor-pointer flex items-start gap-2.5 ${
                      isChecked
                        ? 'border-forest bg-forest/5 text-ink'
                        : 'border-border bg-bg text-ink/80 hover:bg-surface-muted'
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
          </div>

          {/* Staggered Numeric Cards (Ref 11 - 5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="font-heading font-bold text-base text-ink">
              Quantitative Bounds
            </div>

            {/* Staggered Card 1: Marks per Question */}
            <div className="bg-surface border border-border rounded-card p-5 shadow-card hover:-translate-y-0.5 transition-transform space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="filter-marks-per-q"
                  className="font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                >
                  Marks per Question
                </label>
                <span className="pill pill-forest text-[10px]">Filter</span>
              </div>
              <input
                id="filter-marks-per-q"
                type="number"
                step="0.5"
                min="0.5"
                value={marksPerQuestion}
                onChange={(e) => setMarksPerQuestion(e.target.value)}
                placeholder="e.g. 1 or 2.5 (leave empty for any)"
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none"
              />
              <p className="text-[11px] text-ink/50">
                Filters question pool to only match questions worth this exact mark.
              </p>
            </div>

            {/* Staggered Card 2: Target Total Marks */}
            <div className="bg-surface border border-border rounded-card p-5 shadow-card hover:-translate-y-0.5 transition-transform space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="filter-total-marks"
                  className="font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                >
                  Target Total Marks
                </label>
                <span className="pill pill-ember text-[10px]">Total Quota</span>
              </div>
              <input
                id="filter-total-marks"
                type="number"
                min="1"
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
                placeholder="e.g. 25, 50 or 100"
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-ember focus:outline-none"
              />
              <p className="text-[11px] text-ink/50">
                The query algorithm caps question selections to meet this exact total mark target.
              </p>
            </div>

            {/* Staggered Card 3: Max Quantity */}
            <div className="bg-surface border border-border rounded-card p-5 shadow-card hover:-translate-y-0.5 transition-transform space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="filter-quantity"
                  className="font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                >
                  Max Quantity of Questions
                </label>
                <span className="pill pill-grape text-[10px]">Count Cap</span>
              </div>
              <input
                id="filter-quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10 or 20"
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-grape focus:outline-none"
              />
              <p className="text-[11px] text-ink/50">
                Hard ceiling on candidate questions returned for review.
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
