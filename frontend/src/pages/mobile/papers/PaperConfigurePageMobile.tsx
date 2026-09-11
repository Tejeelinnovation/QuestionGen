import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi, type SelectQuestionsConstraints } from '../../../api/papers';
import type { Paper, Topic } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

export const PaperConfigurePageMobile: React.FC = () => {
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

  // Lightweight 3-step mobile sub-flow: 1 = Topics, 2 = Pedagogy & Types, 3 = Marks & Quantities
  const [subStep, setSubStep] = useState<1 | 2 | 3>(1);

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

        if (paperData.chapter) {
          const topicsData = await contentApi.getTopics(paperData.chapter);
          setTopics(topicsData);
        } else {
          setTopics([]);
        }
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
      subjects: paper?.subjects?.length ? paper.subjects : undefined,
      duration_minutes: paper?.duration_minutes,
      total_question_count: paper?.total_question_count,
    };

    setIsSubmitting(true);
    try {
      const candidateQuestions = await papersApi.selectQuestions(paperId, constraints);

      if (candidateQuestions.length === 0) {
        setErrorMessage(
          'No questions found matching your constraints. Try broadening difficulty or topics.'
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
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to select questions with specified constraints.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-xs text-ink/60 font-body">
        Loading curriculum topics for paper #{paperId}...
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body">
      <PaperWorkflowNavMobile
        currentStep="configure"
        paperId={paperId}
        paperTitle={paper?.title}
        backTo={`/papers/${paperId}`}
      />

      {/* Sub-step indicator headline (Simple text, NO numbered circle steppers) */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-0.5">
          <span className="text-[11px] font-mono text-forest font-semibold uppercase tracking-wider">
            Configuration Flow • Part {subStep} of 3
          </span>
          <h1 className="font-heading font-bold text-lg text-ink">
            {subStep === 1 && 'Select Syllabus Topics'}
            {subStep === 2 && 'Pedagogy & Question Types'}
            {subStep === 3 && 'Marks & Distribution'}
          </h1>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* ── Sub-step 1: Syllabus Topics Selection ── */}
      {subStep === 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink/60">
              {selectedTopicIds.length} of {topics.length} topics chosen
            </span>
            <button
              type="button"
              onClick={handleSelectAllTopics}
              className="text-xs font-heading font-semibold text-forest hover:underline cursor-pointer"
            >
              {selectedTopicIds.length === topics.length ? 'Deselect All' : 'Select All Topics'}
            </button>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {topics.length === 0 ? (
              <div className="p-4 rounded-card bg-surface border border-border text-center text-xs text-ink/60">
                No topics configured in this chapter.
              </div>
            ) : (
              topics.map((t) => {
                const isSelected = selectedTopicIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTopicToggle(t.id)}
                    className={`w-full p-3 rounded-card text-left flex items-start justify-between gap-2 border transition-all active:scale-[0.99] cursor-pointer min-h-[48px] ${
                      isSelected
                        ? 'bg-forest/5 border-forest text-ink'
                        : 'bg-surface border-border text-ink hover:border-forest/40'
                    }`}
                  >
                    <div className="space-y-0.5 pr-2">
                      <span className="font-heading font-semibold text-xs text-ink block">
                        {t.name}
                      </span>
                      <span className="text-[11px] text-ink/60 font-mono">
                        {t.question_count} questions in bank
                      </span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-sm border shrink-0 flex items-center justify-center mt-0.5 ${
                        isSelected
                          ? 'bg-forest border-forest text-white'
                          : 'border-border bg-surface'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            id="configure-step-1-next"
            onClick={() => setSubStep(2)}
            className="w-full mt-3 py-3 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
          >
            <span>Next: Pedagogy & Types</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Sub-step 2: Pedagogy, Bloom Level & Question Types ── */}
      {subStep === 2 && (
        <div className="space-y-4">
          {/* Difficulty Selection */}
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2.5">
            <label className="block text-xs font-heading font-semibold text-ink">
              Target Difficulty Level
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Any Difficulty', val: '' },
                { label: 'Easy', val: 'EASY' },
                { label: 'Medium', val: 'MEDIUM' },
                { label: 'Hard', val: 'HARD' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setDifficulty(item.val as any)}
                  className={`py-2.5 px-3 rounded-pill text-xs font-heading font-semibold transition-all min-h-[44px] cursor-pointer ${
                    difficulty === item.val
                      ? 'bg-forest text-white shadow-xs'
                      : 'bg-surface-muted text-ink/70 border border-border hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Learner Level (Bloom's Taxonomy) */}
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2.5">
            <label className="block text-xs font-heading font-semibold text-ink">
              Learner Bloom Taxonomy
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Any Level', val: '' },
                { label: 'Beginner (Remember)', val: 'BEGINNER' },
                { label: 'Intermediate (Apply)', val: 'INTERMEDIATE' },
                { label: 'Advanced (Analyze)', val: 'ADVANCED' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setLearnerLevel(item.val as any)}
                  className={`py-2 px-2.5 rounded-pill text-[11px] font-heading font-semibold transition-all min-h-[44px] cursor-pointer ${
                    learnerLevel === item.val
                      ? 'bg-grape text-white shadow-xs'
                      : 'bg-surface-muted text-ink/70 border border-border hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Question Type */}
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2.5">
            <label className="block text-xs font-heading font-semibold text-ink">
              Question Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'All Formats', val: '' },
                { label: 'MCQ Only', val: 'MCQ' },
                { label: 'Short Answer', val: 'SHORT_ANSWER' },
                { label: 'Long Answer', val: 'LONG_ANSWER' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setQuestionType(item.val as any)}
                  className={`py-2.5 px-3 rounded-pill text-xs font-heading font-semibold transition-all min-h-[44px] cursor-pointer ${
                    questionType === item.val
                      ? 'bg-ember text-white shadow-xs'
                      : 'bg-surface-muted text-ink/70 border border-border hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nav Controls */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSubStep(1)}
              className="flex-1 py-3 px-4 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <button
              type="button"
              id="configure-step-2-next"
              onClick={() => setSubStep(3)}
              className="flex-[2] py-3 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs active:scale-95 transition-all shadow-xs flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <span>Next: Marks & Quantity</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Sub-step 3: Marks & Quantities ── */}
      {subStep === 3 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-quantity"
                className="block text-xs font-heading font-semibold text-ink"
              >
                Number of Questions (Optional)
              </label>
              <input
                id="mobile-quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Leave blank for automatic selection"
                className="w-full px-3.5 py-3 rounded-card bg-surface border border-border text-xs sm:text-sm font-body text-ink focus:border-forest focus:outline-none min-h-[48px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-marks-per-q"
                  className="block text-xs font-heading font-semibold text-ink"
                >
                  Marks per Question
                </label>
                <input
                  id="mobile-marks-per-q"
                  type="number"
                  min={1}
                  value={marksPerQuestion}
                  onChange={(e) => setMarksPerQuestion(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full px-3.5 py-3 rounded-card bg-surface border border-border text-xs sm:text-sm font-body text-ink focus:border-forest focus:outline-none min-h-[48px]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-total-marks"
                  className="block text-xs font-heading font-semibold text-ink"
                >
                  Target Total Marks
                </label>
                <input
                  id="mobile-total-marks"
                  type="number"
                  min={1}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3.5 py-3 rounded-card bg-surface border border-border text-xs sm:text-sm font-body text-ink focus:border-forest focus:outline-none min-h-[48px]"
                />
              </div>
            </div>
          </div>

          {/* Quick Summary Pill Banner */}
          <div className="p-3 rounded-card bg-surface-muted border border-border text-xs space-y-1">
            <span className="font-heading font-semibold text-ink block">Configuration Summary:</span>
            <div className="flex flex-wrap gap-1 text-[11px] text-ink/70">
              <span className="pill pill-forest py-0.5">
                {selectedTopicIds.length > 0 ? `${selectedTopicIds.length} Topics` : 'All Topics'}
              </span>
              <span className="pill pill-ember py-0.5">
                {difficulty || 'Any Difficulty'}
              </span>
              <span className="pill pill-grape py-0.5">
                {questionType || 'Any Format'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSubStep(2)}
              className="flex-1 py-3 px-4 rounded-pill border border-border bg-surface text-ink font-heading font-semibold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <button
              type="submit"
              id="mobile-generate-questions-btn"
              disabled={isSubmitting}
              className="flex-[2] py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                'Selecting Questions...'
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-lime" />
                  <span>Generate Questions</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
