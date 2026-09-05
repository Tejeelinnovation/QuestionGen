import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../api/content';
import { papersApi, type SelectQuestionsConstraints } from '../../api/papers';
import type { Paper, Topic } from '../../types';

export const PaperConfigurePage: React.FC = () => {
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

      // Store in sessionStorage as fallback across page refreshes
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
    return <div className="p-4 text-sm text-gray-600">Loading paper configuration...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Configure Questions (Step 2)</h1>
          {paper && (
            <p className="text-sm text-gray-600 mt-1">
              Paper: <strong>{paper.title}</strong> &bull; Chapter:{' '}
              {paper.chapter_title || `Chapter #${paper.chapter}`}
            </p>
          )}
        </div>
        <Link to={`/papers/${paperId}`} className="text-sm text-blue-600 underline">
          &larr; Paper Details
        </Link>
      </div>

      {errorMessage && (
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border border-gray-300 p-5 space-y-5">
        {/* Topics multi-select */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold">
              Filter by Topics (leave all unselected to include all topics)
            </label>
            {topics.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllTopics}
                className="text-xs text-blue-600 underline cursor-pointer"
              >
                {selectedTopicIds.length === topics.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 p-3 max-h-48 overflow-y-auto bg-gray-50">
            {topics.map((t) => (
              <label key={t.id} className="flex items-center space-x-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTopicIds.includes(t.id)}
                  onChange={() => handleTopicToggle(t.id)}
                  disabled={isSubmitting}
                />
                <span>
                  {t.name} <span className="text-gray-500">({t.question_count} qs)</span>
                </span>
              </label>
            ))}
            {topics.length === 0 && (
              <div className="text-xs text-gray-500">No topics found for this chapter.</div>
            )}
          </div>
        </div>

        {/* Constraint filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="filter-difficulty">
              Difficulty
            </label>
            <select
              id="filter-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-2 py-1 text-sm bg-white"
            >
              <option value="">Any Difficulty</option>
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="filter-type">
              Question Type
            </label>
            <select
              id="filter-type"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as any)}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-2 py-1 text-sm bg-white"
            >
              <option value="">Any Type</option>
              <option value="MCQ">Multiple Choice (MCQ)</option>
              <option value="SHORT_ANSWER">Short Answer</option>
              <option value="LONG_ANSWER">Long Answer</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="filter-level">
              Learner Level
            </label>
            <select
              id="filter-level"
              value={learnerLevel}
              onChange={(e) => setLearnerLevel(e.target.value as any)}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-2 py-1 text-sm bg-white"
            >
              <option value="">Any Level</option>
              <option value="BEGINNER">BEGINNER</option>
              <option value="INTERMEDIATE">INTERMEDIATE</option>
              <option value="ADVANCED">ADVANCED</option>
            </select>
          </div>
        </div>

        {/* Marks & Quantity constraints */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="filter-marks-per-q">
              Marks per Question
            </label>
            <input
              id="filter-marks-per-q"
              type="number"
              step="0.5"
              min="0.5"
              value={marksPerQuestion}
              onChange={(e) => setMarksPerQuestion(e.target.value)}
              placeholder="e.g. 1 or 2"
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-2 py-1 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="filter-total-marks">
              Target Total Marks
            </label>
            <input
              id="filter-total-marks"
              type="number"
              min="1"
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              placeholder="Optional target total"
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-2 py-1 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="filter-quantity">
              Max Quantity of Questions
            </label>
            <input
              id="filter-quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 5 or 10"
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-between items-center">
          <Link
            to={`/papers/${paperId}`}
            className="border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100"
          >
            Cancel
          </Link>
          <button
            type="submit"
            id="select-questions-submit-btn"
            disabled={isSubmitting}
            className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Querying Question Bank...' : 'Select & Review Questions &rarr;'}
          </button>
        </div>
      </form>
    </div>
  );
};
