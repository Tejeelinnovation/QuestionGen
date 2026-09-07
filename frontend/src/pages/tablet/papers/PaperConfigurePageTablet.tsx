import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi, type SelectQuestionsConstraints } from '../../../api/papers';
import type { Paper, Topic } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';

export const PaperConfigurePageTablet: React.FC = () => {
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
      <div className="space-y-6 font-body">
        <PaperWorkflowNavTablet currentStep="configure" paperId={paperId} />
        <div className="bg-surface border border-border rounded-card p-8 text-center text-ink/60 text-sm">
          Loading question bank filters...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-body pb-16">
      <PaperWorkflowNavTablet
        currentStep="configure"
        paperId={paperId}
        paperTitle={paper?.title}
        chapterTitle={paper?.chapter_title}
      />

      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Stage 02 • Constraints Tuning
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Configure Filters & Bounds
        </h1>
        <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
          Tap interactive filter pills and define quantitative quotas for candidate questions.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* Hidden accessible selects for testing/automation */}
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── 2-Column Bento Reflow ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Column 1: Touch Filter Pills */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-5">
            <div className="border-b border-border pb-3">
              <h2 className="font-heading font-bold text-lg text-ink">
                Taxonomy & Question Formats
              </h2>
              <p className="text-xs text-ink/60">
                Tap pills to filter candidate question pool
              </p>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80 block">
                Difficulty Level
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: '', label: 'Any Difficulty', activeBg: 'bg-ink text-white' },
                  { value: 'EASY', label: 'Easy • Foundations', activeBg: 'bg-forest text-white' },
                  { value: 'MEDIUM', label: 'Medium • Standard', activeBg: 'bg-ember text-white' },
                  { value: 'HARD', label: 'Hard • Advanced', activeBg: 'bg-grape text-white' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDifficulty(item.value as any)}
                    disabled={isSubmitting}
                    className={`px-3 py-2.5 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer min-h-[44px] flex items-center justify-center text-center ${
                      difficulty === item.value
                        ? `${item.activeBg} shadow-sm font-semibold`
                        : 'border-border bg-bg text-ink hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Format */}
            <div className="space-y-2 pt-2 border-t border-border">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80 block">
                Question Format
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: '', label: 'All Formats', activeBg: 'bg-ink text-white' },
                  { value: 'MCQ', label: 'Multiple Choice', activeBg: 'bg-forest text-white' },
                  { value: 'SHORT_ANSWER', label: 'Short Answer', activeBg: 'bg-ember text-white' },
                  { value: 'LONG_ANSWER', label: 'Long Answer', activeBg: 'bg-grape text-white' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setQuestionType(item.value as any)}
                    disabled={isSubmitting}
                    className={`px-3 py-2.5 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer min-h-[44px] flex items-center justify-center text-center ${
                      questionType === item.value
                        ? `${item.activeBg} shadow-sm font-semibold`
                        : 'border-border bg-bg text-ink hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Learner Level */}
            <div className="space-y-2 pt-2 border-t border-border">
              <span className="text-xs font-heading font-semibold uppercase tracking-wider text-ink/80 block">
                Learner Cognitive Level
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: '', label: 'Any Level', activeBg: 'bg-ink text-white' },
                  { value: 'BEGINNER', label: 'Beginner', activeBg: 'bg-forest text-white' },
                  { value: 'INTERMEDIATE', label: 'Intermediate', activeBg: 'bg-ember text-white' },
                  { value: 'ADVANCED', label: 'Advanced', activeBg: 'bg-grape text-white' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setLearnerLevel(item.value as any)}
                    disabled={isSubmitting}
                    className={`px-3 py-2.5 text-xs font-heading font-medium rounded-pill border transition-all cursor-pointer min-h-[44px] flex items-center justify-center text-center ${
                      learnerLevel === item.value
                        ? `${item.activeBg} shadow-sm font-semibold`
                        : 'border-border bg-bg text-ink hover:bg-surface-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Quantitative Quotas & Topics Coverage */}
          <div className="space-y-5">
            {/* Quantitative Bounds Cards */}
            <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
              <h3 className="font-heading font-bold text-base text-ink border-b border-border pb-2">
                Quantitative Constraints
              </h3>

              <div className="space-y-3">
                <div>
                  <label htmlFor="filter-marks-per-q" className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                    Marks per Question
                  </label>
                  <input
                    id="filter-marks-per-q"
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={marksPerQuestion}
                    onChange={(e) => setMarksPerQuestion(e.target.value)}
                    placeholder="e.g. 1 or 2 (leave blank for any)"
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:bg-surface focus:border-forest focus:outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="filter-total-marks" className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                    Target Total Marks
                  </label>
                  <input
                    id="filter-total-marks"
                    type="number"
                    min="1"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(e.target.value)}
                    placeholder="e.g. 25, 50, 100"
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:bg-surface focus:border-forest focus:outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="filter-quantity" className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                    Max Quantity of Questions
                  </label>
                  <input
                    id="filter-quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 10 or 15"
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2.5 text-sm text-ink focus:bg-surface focus:border-forest focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* Topics Multi-Select */}
            <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-heading font-bold text-base text-ink">
                  Syllabus Topics
                </h3>
                {topics.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllTopics}
                    className="text-xs font-heading font-semibold text-forest hover:underline cursor-pointer"
                  >
                    {selectedTopicIds.length === topics.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {topics.map((t) => {
                  const isChecked = selectedTopicIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`p-3 rounded-card border flex items-center justify-between cursor-pointer min-h-[44px] ${
                        isChecked
                          ? 'border-forest bg-forest/5 text-ink'
                          : 'border-border bg-bg text-ink/80'
                      }`}
                    >
                      <span className="text-xs font-heading font-semibold truncate pr-2">
                        {t.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] text-ink/50">
                          {t.question_count} qs
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTopicToggle(t.id)}
                          disabled={isSubmitting}
                          className="accent-forest"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* ── Action Toolbar ── */}
        <div className="bg-surface border border-border rounded-card p-4 shadow-card flex items-center justify-between gap-4">
          <Link
            to={`/papers/${paperId}`}
            className="px-4 py-2.5 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-surface-muted min-h-[44px] flex items-center"
          >
            Cancel
          </Link>

          <button
            type="submit"
            id="select-questions-submit-btn"
            disabled={isSubmitting}
            className="px-6 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center gap-2"
          >
            <span>{isSubmitting ? 'Querying Questions...' : 'Select & Review Questions'}</span>
            <span>→</span>
          </button>
        </div>
      </form>
    </div>
  );
};
