import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import type { StudentAttemptResult } from '../../types';

export const ResultPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const attemptId = Number(id);

  const [result, setResult] = useState<StudentAttemptResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await attemptsApi.getAttemptResult(attemptId);
        setResult(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load test attempt results from server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (attemptId) {
      fetchResult();
    }
  }, [attemptId]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading test results...</div>;
  }

  if (errorMessage || !result) {
    return (
      <div className="p-4 space-y-4 max-w-2xl">
        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
            {errorMessage}
          </div>
        )}
        <Link to="/dashboard/student" className="text-blue-600 underline text-sm">
          &larr; Return to Student Dashboard
        </Link>
      </div>
    );
  }

  const isEvaluated = result.status === 'EVALUATED';
  const isSubmitted = result.status === 'SUBMITTED';
  const percentage =
    result.max_score > 0 ? ((result.score / result.max_score) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{result.paper_title || `Attempt #${result.id}`}</h1>
          <p className="text-xs text-gray-500 mt-1">
            Submitted on {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : '—'}
          </p>
        </div>

        <Link to="/dashboard/student" className="text-sm text-blue-600 underline">
          &larr; Student Dashboard
        </Link>
      </div>

      {/* Pending review banner */}
      {isSubmitted && (
        <div
          id="pending-review-banner"
          className="border border-yellow-300 bg-yellow-50 text-yellow-900 p-4 text-sm font-medium"
        >
          Some answers are pending teacher review — your final score may change.
        </div>
      )}

      {/* Score Summary Card */}
      <div className="border border-gray-300 bg-gray-50 p-6 flex justify-around items-center text-center">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Status</div>
          <div className="text-lg font-bold mt-1">
            <span
              className={`px-2 py-0.5 text-xs border ${
                isEvaluated
                  ? 'border-green-400 bg-green-100 text-green-900 font-semibold'
                  : 'border-yellow-400 bg-yellow-100 text-yellow-900 font-semibold'
              }`}
            >
              {result.status}
            </span>
          </div>
        </div>

        <div className="border-l border-gray-300 pl-6">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total Score</div>
          <div className="text-3xl font-extrabold mt-1 text-black" id="result-score-display">
            {result.score} <span className="text-sm font-normal text-gray-500">/ {result.max_score}</span>
          </div>
        </div>

        <div className="border-l border-gray-300 pl-6">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Percentage</div>
          <div className="text-2xl font-bold mt-1 text-gray-800">{percentage}%</div>
        </div>
      </div>

      {/* Detailed Question Answers Breakdown */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Question Breakdown</h2>

        <div className="space-y-3">
          {result.answers?.map((a, idx) => (
            <div key={a.question_id || idx} className="border border-gray-300 bg-white p-4 space-y-2">
              <div className="flex justify-between items-center text-xs border-b border-gray-100 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-black">Q{idx + 1}.</span>
                  <span className="border border-gray-200 px-1.5 py-0.5 bg-gray-100">
                    {a.question_type}
                  </span>

                  {/* Correctness Badges */}
                  {a.is_correct === true && (
                    <span className="border border-green-300 bg-green-100 text-green-800 px-2 py-0.5 font-bold">
                      Correct
                    </span>
                  )}
                  {a.is_correct === false && (
                    <span className="border border-red-300 bg-red-100 text-red-800 px-2 py-0.5 font-bold">
                      Incorrect
                    </span>
                  )}
                  {a.pending_manual_review && (
                    <span className="border border-yellow-300 bg-yellow-100 text-yellow-800 px-2 py-0.5 font-semibold">
                      Pending review
                    </span>
                  )}
                </div>

                <span className="font-bold text-black text-sm">
                  {a.marks_awarded !== null ? a.marks_awarded : '—'} / {a.max_marks} Marks
                </span>
              </div>

              <p className="text-sm font-medium pt-1">{a.question_text}</p>

              {/* Student Response */}
              <div className="text-xs bg-gray-50 border border-gray-200 p-2 rounded">
                <span className="text-gray-500">Your Answer: </span>
                <strong className="text-black">
                  {a.student_response ? a.student_response : <em className="text-gray-400">No response provided</em>}
                </strong>
              </div>

              {/* Correct Answer if available */}
              {a.correct_answer && (
                <div className="text-xs bg-green-50 border border-green-200 p-2 text-green-900 rounded">
                  <span>Correct Answer: </span>
                  <strong>{a.correct_answer}</strong>
                </div>
              )}
            </div>
          ))}

          {(!result.answers || result.answers.length === 0) && (
            <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              No individual answer breakdown records available for this attempt.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
