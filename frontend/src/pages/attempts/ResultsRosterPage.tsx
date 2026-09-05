import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attemptsApi } from '../../api/attempts';
import type { DeliveryResultsRoster } from '../../types';

export const ResultsRosterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deliveryId = Number(id);

  const [roster, setRoster] = useState<DeliveryResultsRoster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRoster = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await attemptsApi.getDeliveryResults(deliveryId);
      setRoster(data);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load test delivery results roster.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (deliveryId) {
      fetchRoster();
    }
  }, [deliveryId]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading delivery results roster...</div>;
  }

  if (errorMessage || !roster) {
    return (
      <div className="p-4 space-y-4 max-w-2xl">
        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
            {errorMessage}
          </div>
        )}
        <Link to="/dashboard/teacher" className="text-blue-600 underline text-sm">
          &larr; Return to Teacher Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">
            Delivery Results: {roster.paper_title}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Delivery #{roster.delivery_id} &bull; Version <strong>{roster.version_label}</strong> &bull; Total Marks: {roster.total_marks}
          </p>
        </div>

        <div className="flex space-x-3 text-sm">
          <button
            onClick={fetchRoster}
            disabled={isLoading}
            className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-3 py-1 cursor-pointer disabled:opacity-50"
          >
            Refresh
          </button>
          <Link to="/dashboard/teacher" className="text-blue-600 underline self-center">
            &larr; Teacher Dashboard
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="border border-gray-300 p-3 bg-gray-50">
          <div className="text-xs text-gray-500">Assigned Students</div>
          <div className="text-xl font-bold">{roster.total_students_assigned}</div>
        </div>
        <div className="border border-gray-300 p-3 bg-gray-50">
          <div className="text-xs text-gray-500">Attempts Started</div>
          <div className="text-xl font-bold">{roster.attempts_count}</div>
        </div>
        <div className="border border-gray-300 p-3 bg-gray-50">
          <div className="text-xs text-gray-500">Submitted</div>
          <div className="text-xl font-bold">{roster.submitted_count}</div>
        </div>
        <div className="border border-gray-300 p-3 bg-gray-50">
          <div className="text-xs text-gray-500">Fully Evaluated</div>
          <div className="text-xl font-bold">{roster.evaluated_count}</div>
        </div>
      </div>

      {/* Attempts Table */}
      <section className="border border-gray-300 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Student Attempts Roster</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-300 p-2">Student</th>
                <th className="border border-gray-300 p-2">Attempt ID</th>
                <th className="border border-gray-300 p-2">Status</th>
                <th className="border border-gray-300 p-2">Score</th>
                <th className="border border-gray-300 p-2">Submitted At</th>
                <th className="border border-gray-300 p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.attempts.map((a) => {
                const isEvaluated = a.status === 'EVALUATED';
                const isSubmitted = a.status === 'SUBMITTED';

                return (
                  <tr key={a.attempt_id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2 font-medium">
                      {a.student_username}
                    </td>
                    <td className="border border-gray-300 p-2">#{a.attempt_id}</td>
                    <td className="border border-gray-300 p-2">
                      <span
                        className={`text-xs px-2 py-0.5 border font-semibold ${
                          isEvaluated
                            ? 'border-green-400 bg-green-50 text-green-800'
                            : isSubmitted
                            ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                            : 'border-gray-300 bg-gray-100 text-gray-700'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2 font-semibold">
                      {a.score !== null && a.score !== undefined
                        ? `${a.score} / ${a.max_score}`
                        : '—'}
                    </td>
                    <td className="border border-gray-300 p-2 text-xs text-gray-500">
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : 'Not submitted'}
                    </td>
                    <td className="border border-gray-300 p-2">
                      <Link
                        to={`/attempts/${a.attempt_id}/grade`}
                        id={`grade-attempt-${a.attempt_id}-link`}
                        className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-3 py-1 text-xs font-medium inline-block cursor-pointer"
                      >
                        {isEvaluated ? 'Review / Edit Grade &rarr;' : 'Grade Attempt &rarr;'}
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {roster.attempts.length === 0 && (
                <tr>
                  <td colSpan={6} className="border border-gray-300 p-6 text-center text-gray-500">
                    No attempts recorded yet for this test delivery.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
