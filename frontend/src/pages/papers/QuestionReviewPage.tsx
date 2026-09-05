import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import type { QuestionPreview } from '../../types';

export const QuestionReviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();

  const [questions, setQuestions] = useState<QuestionPreview[]>([]);
  const [constraints, setConstraints] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const extractQuestions = (val: any): QuestionPreview[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (Array.isArray(val.questions)) return val.questions;
      return [];
    };

    // 1. Try location.state
    const state = location.state as {
      questions?: any;
      constraints?: Record<string, any>;
    } | null;

    if (state?.questions) {
      setQuestions(extractQuestions(state.questions));
      setConstraints(state.constraints || {});
      return;
    }

    // 2. Fallback to sessionStorage
    const stored = sessionStorage.getItem(`paper_${paperId}_review`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.questions) {
          setQuestions(extractQuestions(parsed.questions));
          setConstraints(parsed.constraints || {});
          return;
        }
      } catch (err) {
        console.error('Failed to parse cached review questions:', err);
      }
    }
  }, [paperId, location.state]);

  const handleRemoveQuestion = (questionId: number) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const runningTotalMarks = questions.reduce(
    (sum, q) => sum + (parseFloat(String(q.marks)) || 0),
    0
  );

  const handleSaveAsVersion = async () => {
    setErrorMessage(null);
    setIsSaving(true);
    try {
      const newVersion = await papersApi.createVersion(paperId, {
        question_ids: questions.map((q) => q.id),
        constraints_used: constraints,
      });

      sessionStorage.removeItem(`paper_${paperId}_review`);
      navigate(`/papers/${paperId}/versions/${newVersion.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.question_ids?.[0] ||
        err.response?.data?.question_ids ||
        err.response?.data?.total_marks?.[0] ||
        err.response?.data?.total_marks ||
        err.response?.data?.detail ||
        (typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data)) ||
        'Failed to save questions as a new version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Review Candidate Questions (Step 3)</h1>
          <p className="text-sm text-gray-600 mt-1">
            Reorder questions, remove unwanted ones, and save as a formal version.
          </p>
        </div>
        <Link to={`/papers/${paperId}/configure`} className="text-sm text-blue-600 underline">
          &larr; Reconfigure Filters
        </Link>
      </div>

      {errorMessage && (
        <div
          id="review-error-banner"
          className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm"
        >
          {errorMessage}
        </div>
      )}

      {/* Summary card */}
      <div className="border border-gray-300 bg-gray-50 p-4 flex justify-between items-center text-sm">
        <div>
          <span>Total Selected Questions: <strong>{questions.length}</strong></span>
          <span className="mx-3 text-gray-400">|</span>
          <span>
            Running Total Marks: <strong>{runningTotalMarks.toFixed(1)}</strong>
          </span>
        </div>

        <button
          onClick={handleSaveAsVersion}
          id="save-version-btn"
          disabled={isSaving}
          className="border border-gray-400 bg-gray-200 hover:bg-gray-300 px-4 py-2 font-medium cursor-pointer disabled:opacity-50"
        >
          {isSaving ? 'Saving Version...' : 'Save as Version &rarr;'}
        </button>
      </div>

      {/* Questions list */}
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="border border-gray-300 p-4 bg-white flex justify-between items-start space-x-4"
          >
            <div className="space-y-2 flex-1">
              <div className="flex items-center space-x-2 text-xs text-gray-600">
                <span className="font-bold text-sm text-black">#{idx + 1}</span>
                <span className="border border-gray-300 px-1.5 py-0.5 bg-gray-100">
                  {q.question_type_display || q.question_type}
                </span>
                <span className="border border-gray-300 px-1.5 py-0.5 bg-gray-100">
                  {q.difficulty_display || q.difficulty}
                </span>
                {q.topic_name && <span>Topic: {q.topic_name}</span>}
                <span className="font-bold text-black ml-auto">Marks: {q.marks}</span>
              </div>

              <p className="text-sm font-medium">{q.question_text}</p>

              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-700 pl-2">
                  {Object.entries(q.options).map(([optKey, optVal]) => (
                    <div key={optKey}>
                      <strong>({optKey})</strong> {optVal}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions: Reorder & Remove */}
            <div className="flex flex-col space-y-1 text-xs shrink-0">
              <button
                type="button"
                onClick={() => handleMoveUp(idx)}
                disabled={idx === 0 || isSaving}
                className="border border-gray-300 px-2 py-1 bg-gray-50 hover:bg-gray-100 disabled:opacity-30 cursor-pointer"
                title="Move up"
              >
                &uarr; Up
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(idx)}
                disabled={idx === questions.length - 1 || isSaving}
                className="border border-gray-300 px-2 py-1 bg-gray-50 hover:bg-gray-100 disabled:opacity-30 cursor-pointer"
                title="Move down"
              >
                &darr; Down
              </button>
              <button
                type="button"
                onClick={() => handleRemoveQuestion(q.id)}
                disabled={isSaving}
                className="border border-red-300 text-red-700 px-2 py-1 bg-red-50 hover:bg-red-100 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {questions.length === 0 && (
          <div className="border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No questions in this review set.
            <div className="mt-3">
              <Link
                to={`/papers/${paperId}/configure`}
                className="text-blue-600 underline font-medium"
              >
                Configure questions again
              </Link>
            </div>
          </div>
        )}
      </div>

      {questions.length > 0 && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveAsVersion}
            disabled={isSaving}
            className="border border-gray-400 bg-gray-200 hover:bg-gray-300 px-5 py-2 font-medium text-sm cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Saving Version...' : 'Save as Version &rarr;'}
          </button>
        </div>
      )}
    </div>
  );
};
