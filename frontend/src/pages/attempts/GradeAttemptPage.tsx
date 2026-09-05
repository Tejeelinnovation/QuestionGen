import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import type { TeacherAttemptDetail, TeacherAttemptAnswerItem } from '../../types';

interface GradeFormState {
  marks: string;
  isCorrect: boolean;
  isEditing: boolean;
  isSaving: boolean;
  error: string | null;
}

export const GradeAttemptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const attemptId = Number(id);

  const [attempt, setAttempt] = useState<TeacherAttemptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Per-question form state indexed by question_id
  const [gradingState, setGradingState] = useState<Record<number, GradeFormState>>({});

  const fetchAttempt = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await attemptsApi.getTeacherAttemptDetail(attemptId);
      setAttempt(data);

      // Initialize grading state for answers
      const initialMap: Record<number, GradeFormState> = {};
      data.answers.forEach((ans) => {
        const isGraded = ans.marks_awarded !== null;
        initialMap[ans.question_id] = {
          marks: ans.marks_awarded !== null ? String(ans.marks_awarded) : '0',
          isCorrect: ans.is_correct ?? false,
          isEditing: !isGraded,
          isSaving: false,
          error: null,
        };
      });
      setGradingState((prev) => ({ ...initialMap, ...prev }));
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load attempt details for grading.'
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (attemptId) {
      fetchAttempt(true);
    }
  }, [attemptId]);

  const handleGradeChange = (questionId: number, field: 'marks' | 'isCorrect', value: any) => {
    setGradingState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: value,
        error: null,
      },
    }));
  };

  const handleToggleEdit = (questionId: number, editState: boolean) => {
    setGradingState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        isEditing: editState,
        error: null,
      },
    }));
  };

  const handleSaveGrade = async (ans: TeacherAttemptAnswerItem) => {
    const qState = gradingState[ans.question_id];
    if (!qState) return;

    const parsedMarks = parseFloat(qState.marks);
    if (isNaN(parsedMarks) || parsedMarks < 0) {
      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          error: 'Marks must be a valid positive number.',
        },
      }));
      return;
    }

    if (parsedMarks > ans.max_marks) {
      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          error: `Marks cannot exceed max marks (${ans.max_marks}).`,
        },
      }));
      return;
    }

    setGradingState((prev) => ({
      ...prev,
      [ans.question_id]: { ...prev[ans.question_id], isSaving: true, error: null },
    }));
    setSuccessBanner(null);

    try {
      const resp = await attemptsApi.gradeAnswer(attemptId, ans.question_id, {
        marks_awarded: parsedMarks,
        is_correct: qState.isCorrect,
      });

      // Update attempt in state with new score and status
      setAttempt((prev) => {
        if (!prev) return null;
        const updatedAnswers = prev.answers.map((a) => {
          if (a.question_id === ans.question_id) {
            return {
              ...a,
              marks_awarded: resp.marks_awarded,
              is_correct: resp.is_correct,
              needs_grading: false,
            };
          }
          return a;
        });

        return {
          ...prev,
          score: resp.attempt_score,
          status: resp.attempt_status,
          answers: updatedAnswers,
        };
      });

      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          isEditing: false,
          isSaving: false,
          marks: String(resp.marks_awarded),
          isCorrect: resp.is_correct,
          error: null,
        },
      }));

      setSuccessBanner(`Grade saved for Question #${ans.question_id}.`);
    } catch (err: any) {
      const errDetail =
        err.response?.data?.marks_awarded ||
        err.response?.data?.detail ||
        'Failed to save grade for this question.';
      setGradingState((prev) => ({
        ...prev,
        [ans.question_id]: {
          ...prev[ans.question_id],
          isSaving: false,
          error: typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail),
        },
      }));
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading attempt for grading...</div>;
  }

  if (errorMessage || !attempt) {
    return (
      <div className="p-4 space-y-4 max-w-2xl">
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
          {errorMessage || 'Attempt not found.'}
        </div>
        <Link to="/dashboard/teacher" className="text-blue-600 underline text-sm">
          &larr; Return to Teacher Dashboard
        </Link>
      </div>
    );
  }

  const isEvaluated = attempt.status === 'EVALUATED';
  const pendingCount = attempt.answers.filter((a) => a.marks_awarded === null).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Navigation Breadcrumb */}
      <div className="flex justify-between items-center text-sm">
        <Link
          to={`/deliveries/${attempt.delivery}/results`}
          className="text-blue-600 underline"
        >
          &larr; Back to Results Roster
        </Link>
        <Link to="/dashboard/teacher" className="text-gray-500 underline text-xs">
          Teacher Dashboard
        </Link>
      </div>

      {/* Header Info Card */}
      <div className="border border-gray-300 bg-gray-50 p-4 space-y-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">
              Grading Attempt #{attempt.id}: {attempt.paper_title || 'Paper'}
            </h1>
            <p className="text-sm text-gray-600">
              Student: <strong className="font-semibold text-gray-800">{attempt.student_username}</strong> (ID: {attempt.student_id})
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                isEvaluated
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
              }`}
            >
              {attempt.status}
            </span>
            <p className="text-xs text-gray-500 mt-1">
              Submitted:{' '}
              {attempt.submitted_at
                ? new Date(attempt.submitted_at).toLocaleString()
                : '—'}
            </p>
          </div>
        </div>

        {/* Score and Progress Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-200 text-sm">
          <div>
            <span className="text-gray-500 text-xs block">Current Score</span>
            <span className="text-lg font-bold text-gray-900">
              {attempt.score !== null ? attempt.score : 0} / {attempt.max_score}
            </span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Pending Manual Review</span>
            <span
              className={`text-lg font-bold ${
                pendingCount > 0 ? 'text-amber-600' : 'text-green-600'
              }`}
            >
              {pendingCount} {pendingCount === 1 ? 'question' : 'questions'}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-gray-500 text-xs block">Total Questions</span>
            <span className="text-lg font-bold text-gray-900">
              {attempt.answers.length}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="border border-green-300 bg-green-50 text-green-800 p-3 text-sm">
          {successBanner}
        </div>
      )}
      {isEvaluated && (
        <div className="border border-green-300 bg-green-50 text-green-800 p-3 text-sm">
          ✓ All questions have been graded! This attempt is marked as <strong>EVALUATED</strong>.
        </div>
      )}

      {/* Questions Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Responses & Grading</h2>

        {attempt.answers.map((ans, idx) => {
          const qState = gradingState[ans.question_id] || {
            marks: '0',
            isCorrect: false,
            isEditing: true,
            isSaving: false,
            error: null,
          };
          const isObjective = ans.question_type === 'MCQ';
          const isGraded = ans.marks_awarded !== null;

          return (
            <div
              key={ans.question_id}
              className={`border p-4 space-y-3 ${
                ans.marks_awarded === null
                  ? 'border-amber-300 bg-amber-50/20'
                  : 'border-gray-300 bg-white'
              }`}
            >
              {/* Question Header */}
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm">Q{idx + 1}.</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 border text-gray-700">
                    {ans.question_type}
                  </span>
                  <span className="text-xs text-gray-500">
                    Max Marks: {ans.max_marks}
                  </span>
                </div>

                <div className="text-right">
                  {isGraded ? (
                    <span className="text-sm font-semibold text-gray-800">
                      Awarded: {ans.marks_awarded} / {ans.max_marks} pts
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 border border-amber-300">
                      Pending Grading
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <p className="text-sm text-gray-900 whitespace-pre-line">
                {ans.question_text}
              </p>

              {/* Student's Response */}
              <div className="bg-gray-50 border border-gray-200 p-3">
                <span className="text-xs font-semibold text-gray-500 block mb-1">
                  Student's Response:
                </span>
                {ans.student_response ? (
                  <p className="text-sm font-mono whitespace-pre-wrap text-gray-800">
                    {ans.student_response}
                  </p>
                ) : (
                  <p className="text-sm italic text-gray-400">
                    (No answer provided)
                  </p>
                )}
              </div>

              {/* Correct Reference / Answer Key if available */}
              {ans.correct_answer !== undefined && ans.correct_answer !== null && (
                <div className="text-xs text-gray-600 bg-gray-100/70 p-2 border border-dashed border-gray-300">
                  <strong className="font-medium text-gray-700">Reference / Correct Answer:</strong>{' '}
                  {typeof ans.correct_answer === 'object'
                    ? JSON.stringify(ans.correct_answer)
                    : String(ans.correct_answer)}
                </div>
              )}

              {/* Grading Controls / Display */}
              {isObjective ? (
                <div className="pt-2 border-t border-gray-200 text-xs text-gray-600 flex items-center justify-between">
                  <span>Auto-graded (Objective MCQ)</span>
                  <span
                    className={`font-semibold ${
                      ans.is_correct ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {ans.is_correct ? '✓ Correct' : '✗ Incorrect'} ({ans.marks_awarded} pts)
                  </span>
                </div>
              ) : (
                <div className="pt-2 border-t border-gray-200">
                  {qState.isEditing ? (
                    <div className="space-y-3 bg-gray-50 p-3 border border-gray-200">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center space-x-2">
                          <span className="font-medium text-gray-700">Marks Awarded:</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={ans.max_marks}
                            value={qState.marks}
                            onChange={(e) =>
                              handleGradeChange(ans.question_id, 'marks', e.target.value)
                            }
                            className="border border-gray-300 px-2 py-1 w-20 text-sm"
                            disabled={qState.isSaving}
                          />
                          <span className="text-xs text-gray-500">
                            / {ans.max_marks}
                          </span>
                        </label>

                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={qState.isCorrect}
                            onChange={(e) =>
                              handleGradeChange(ans.question_id, 'isCorrect', e.target.checked)
                            }
                            disabled={qState.isSaving}
                            className="h-4 w-4"
                          />
                          <span className="text-gray-700 font-medium">Mark as Correct</span>
                        </label>

                        <div className="flex items-center space-x-2 ml-auto">
                          {isGraded && (
                            <button
                              type="button"
                              onClick={() => handleToggleEdit(ans.question_id, false)}
                              disabled={qState.isSaving}
                              className="px-3 py-1 text-xs border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSaveGrade(ans)}
                            disabled={qState.isSaving}
                            className="px-4 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {qState.isSaving ? 'Saving...' : 'Save Grade'}
                          </button>
                        </div>
                      </div>

                      {qState.error && (
                        <p className="text-xs text-red-600">{qState.error}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center space-x-3">
                        <span className="font-semibold text-gray-800">
                          Awarded: {ans.marks_awarded} / {ans.max_marks} pts
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            ans.is_correct
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {ans.is_correct ? 'Correct' : 'Incorrect / Partial'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleEdit(ans.question_id, true)}
                        className="text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        Edit Grade
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Footer Actions */}
      <div className="pt-4 border-t border-gray-300 flex justify-between items-center">
        <Link
          to={`/deliveries/${attempt.delivery}/results`}
          className="border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          &larr; Back to Results Roster
        </Link>
        <Link
          to="/dashboard/teacher"
          className="text-sm text-gray-600 underline hover:text-gray-800"
        >
          Return to Teacher Dashboard
        </Link>
      </div>
    </div>
  );
};
