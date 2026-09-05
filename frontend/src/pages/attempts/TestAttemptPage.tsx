import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import type { AttemptQuestionItem, AttemptStartResponse } from '../../types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const TestAttemptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);
  const navigate = useNavigate();

  const [attemptData, setAttemptData] = useState<AttemptStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Debounce timers map
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const startOrResume = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await attemptsApi.startOrResumeAttempt(deliveryId);

        // Store attempt id mapping for quick navigation & double submit handling
        sessionStorage.setItem(`delivery_${deliveryId}_attempt`, String(data.attempt_id));

        // If already submitted or evaluated, redirect straight to result
        if (data.status === 'SUBMITTED' || data.status === 'EVALUATED') {
          navigate(`/attempts/${data.attempt_id}/result`, { replace: true });
          return;
        }

        setAttemptData(data);

        // Initialize answers map from existing student_responses
        const initialAnswers: Record<number, string> = {};
        const initialStatuses: Record<number, SaveStatus> = {};
        data.questions.forEach((q) => {
          initialAnswers[q.question_id] = q.student_response || '';
          initialStatuses[q.question_id] = q.student_response ? 'saved' : 'idle';
        });
        setAnswers(initialAnswers);
        setSaveStatuses(initialStatuses);

        // Check if delivery available_until has already passed
        if (data.available_until && new Date() > new Date(data.available_until)) {
          setIsExpired(true);
        }
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        if (detail === 'You have already submitted this test.') {
          const cachedAttemptId = sessionStorage.getItem(`delivery_${deliveryId}_attempt`);
          if (cachedAttemptId) {
            navigate(`/attempts/${cachedAttemptId}/result`, { replace: true });
            return;
          }
        }
        if (detail === 'This test has expired.') {
          setIsExpired(true);
        }
        setErrorMessage(
          detail || JSON.stringify(err.response?.data) || 'Failed to start or resume test attempt.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (deliveryId) {
      startOrResume();
    }
  }, [deliveryId, navigate]);

  // Actual API save function
  const performSave = useCallback(
    async (attemptId: number, questionId: number, responseText: string) => {
      setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saving' }));
      try {
        await attemptsApi.saveAnswer(attemptId, questionId, responseText);
        setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saved' }));
      } catch (err: any) {
        console.error(`Failed to auto-save answer for question ${questionId}:`, err);
        setSaveStatuses((prev) => ({ ...prev, [questionId]: 'error' }));
      }
    },
    []
  );

  // Debounced handler for text inputs
  const handleTextChange = (questionId: number, value: string) => {
    if (isExpired || isSubmitting || !attemptData) return;

    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setSaveStatuses((prev) => ({ ...prev, [questionId]: 'saving' }));

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    debounceTimers.current[questionId] = setTimeout(() => {
      performSave(attemptData.attempt_id, questionId, value);
    }, 600);
  };

  // Immediate handler for radio option select (MCQ)
  const handleOptionSelect = (questionId: number, optionKey: string) => {
    if (isExpired || isSubmitting || !attemptData) return;

    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    performSave(attemptData.attempt_id, questionId, optionKey);
  };

  const handleSubmit = async () => {
    if (!attemptData || isSubmitting || isExpired) return;

    const confirmed = window.confirm(
      'Are you sure you want to submit your test? You will not be able to make any further changes after submission.'
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await attemptsApi.submitAttempt(attemptData.attempt_id);
      sessionStorage.setItem(`delivery_${deliveryId}_attempt`, String(result.id));
      navigate(`/attempts/${result.id}/result`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === 'Attempt has already been submitted.') {
        navigate(`/attempts/${attemptData.attempt_id}/result`);
        return;
      }
      setErrorMessage(
        detail || JSON.stringify(err.response?.data) || 'Failed to submit test attempt.'
      );
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading test attempt...</div>;
  }

  if (!attemptData) {
    return (
      <div className="p-4 space-y-4 max-w-2xl">
        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
            {errorMessage}
          </div>
        )}
        <div>
          <Link to="/dashboard/student" className="text-blue-600 underline text-sm">
            &larr; Return to Student Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const answeredCount = Object.values(answers).filter((val) => val && val.trim().length > 0).length;
  const totalQuestions = attemptData.questions.length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16">
      {/* Test Header */}
      <div className="border border-gray-300 bg-white p-5 space-y-2">
        <div className="flex justify-between items-baseline">
          <h1 className="text-2xl font-bold">{attemptData.paper_title}</h1>
          <span className="text-xs border border-gray-300 px-2 py-0.5 bg-gray-100 font-semibold">
            Version {attemptData.version_label}
          </span>
        </div>

        {attemptData.instructions && (
          <p className="text-xs text-gray-700 italic border-t border-gray-200 pt-2">
            <strong>Instructions:</strong> {attemptData.instructions}
          </p>
        )}

        <div className="flex justify-between items-center text-xs text-gray-600 border-t border-gray-200 pt-2">
          <span>
            Progress: <strong>{answeredCount} of {totalQuestions} answered</strong>
          </span>
          <span>
            Total Marks: <strong>{attemptData.total_marks}</strong>
          </span>
        </div>
      </div>

      {isExpired && (
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-900 p-4 text-sm font-medium">
          The submission window for this test has closed. Further changes and submission are disabled.
        </div>
      )}

      {errorMessage && (
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-4">
        {attemptData.questions.map((q: AttemptQuestionItem, idx: number) => {
          const currentAnswer = answers[q.question_id] || '';
          const saveStatus = saveStatuses[q.question_id] || 'idle';

          return (
            <div key={q.question_id} className="border border-gray-300 bg-white p-5 space-y-3">
              <div className="flex justify-between items-center text-xs border-b border-gray-100 pb-2">
                <span className="font-bold text-sm text-black">
                  Question {idx + 1}
                </span>
                <div className="flex items-center space-x-3">
                  {/* Inline Save Status Indicator */}
                  {saveStatus === 'saving' && (
                    <span className="text-blue-600 font-medium animate-pulse">Saving...</span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-green-700 font-medium">Saved</span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="text-red-600 font-medium">Error saving</span>
                  )}

                  <span className="font-semibold text-black">[{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]</span>
                </div>
              </div>

              <p className="text-sm font-medium">{q.question_text}</p>

              {/* MCQ Options */}
              {q.question_type === 'MCQ' && q.options && (
                <div className="space-y-2 pt-1">
                  {Object.entries(q.options).map(([key, label]) => {
                    const isSelected = currentAnswer.trim().toUpperCase() === key.trim().toUpperCase();
                    return (
                      <label
                        key={key}
                        className={`flex items-baseline space-x-3 p-2 text-sm border rounded cursor-pointer ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 font-medium'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${q.question_id}`}
                          value={key}
                          checked={isSelected}
                          onChange={() => handleOptionSelect(q.question_id, key)}
                          disabled={isExpired || isSubmitting}
                          className="cursor-pointer"
                        />
                        <span>
                          <strong>({key})</strong> {label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* SHORT_ANSWER input */}
              {q.question_type === 'SHORT_ANSWER' && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.question_id, e.target.value)}
                    disabled={isExpired || isSubmitting}
                    placeholder="Type your short answer here..."
                    className="w-full border border-gray-400 p-2 text-sm"
                  />
                </div>
              )}

              {/* LONG_ANSWER textarea */}
              {q.question_type === 'LONG_ANSWER' && (
                <div className="pt-1">
                  <textarea
                    rows={4}
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.question_id, e.target.value)}
                    disabled={isExpired || isSubmitting}
                    placeholder="Type your answer explanation here..."
                    className="w-full border border-gray-400 p-2 text-sm"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Submit Toolbar */}
      <div className="border border-gray-300 bg-gray-50 p-4 flex justify-between items-center sticky bottom-0 shadow-sm">
        <Link to="/dashboard/student" className="text-xs text-blue-600 underline">
          &larr; Exit to Dashboard
        </Link>

        <div className="flex items-center space-x-4">
          <span className="text-xs text-gray-600">
            {answeredCount === totalQuestions ? (
              <strong className="text-green-700">All questions answered</strong>
            ) : (
              <span>{totalQuestions - answeredCount} question(s) remaining</span>
            )}
          </span>

          <button
            onClick={handleSubmit}
            id="submit-test-btn"
            disabled={isSubmitting || isExpired}
            className="border border-green-600 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 text-sm cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting Test...' : 'Submit Test'}
          </button>
        </div>
      </div>
    </div>
  );
};
