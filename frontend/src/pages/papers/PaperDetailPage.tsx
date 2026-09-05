import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { useAuth } from '../../auth/AuthContext';
import type { Paper } from '../../types';

export const PaperDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const { hasCapability } = useAuth();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaper = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await papersApi.getPaper(paperId);
        setPaper(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load question paper details.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId) {
      fetchPaper();
    }
  }, [paperId]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading paper details...</div>;
  }

  if (errorMessage || !paper) {
    return (
      <div className="p-4 space-y-4">
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

  const canCreatePaper = hasCapability('CREATE_PAPER');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{paper.title}</h1>
          <p className="text-sm text-gray-600 mt-1">
            Chapter: {paper.chapter_title || `Chapter #${paper.chapter}`} &bull; Status:{' '}
            <strong>{paper.status}</strong>
          </p>
        </div>

        <div className="flex space-x-3 text-sm">
          <Link to="/dashboard/teacher" className="text-blue-600 underline">
            &larr; Teacher Dashboard
          </Link>
          {canCreatePaper && (
            <Link
              to={`/papers/${paperId}/configure`}
              id="new-version-btn"
              className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-3 py-1 font-medium"
            >
              + Configure New Version
            </Link>
          )}
        </div>
      </div>

      {paper.instructions && (
        <div className="border border-gray-200 bg-gray-50 p-3 text-sm">
          <strong>Instructions:</strong> {paper.instructions}
        </div>
      )}

      {/* Paper Versions List */}
      <section className="border border-gray-300 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Versions of this Paper</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-300 p-2">Version</th>
                <th className="border border-gray-300 p-2">Status</th>
                <th className="border border-gray-300 p-2">Total Marks</th>
                <th className="border border-gray-300 p-2">Questions</th>
                <th className="border border-gray-300 p-2">Created</th>
                <th className="border border-gray-300 p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {paper.versions?.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 p-2 font-bold">
                    Version {v.version_label}
                  </td>
                  <td className="border border-gray-300 p-2">
                    <span
                      className={`text-xs px-2 py-0.5 border ${
                        v.status === 'FINALIZED'
                          ? 'border-green-400 bg-green-50 text-green-800'
                          : 'border-yellow-400 bg-yellow-50 text-yellow-800'
                      }`}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td className="border border-gray-300 p-2">{v.total_marks}</td>
                  <td className="border border-gray-300 p-2">{v.question_count}</td>
                  <td className="border border-gray-300 p-2 text-xs text-gray-500">
                    {new Date(v.created_at).toLocaleDateString()}
                  </td>
                  <td className="border border-gray-300 p-2">
                    <Link
                      to={`/papers/${paperId}/versions/${v.id}`}
                      className="border border-gray-300 bg-gray-50 hover:bg-gray-100 px-2 py-1 text-xs font-medium inline-block"
                    >
                      View Version &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {(!paper.versions || paper.versions.length === 0) && (
                <tr>
                  <td colSpan={6} className="border border-gray-300 p-4 text-center text-gray-500">
                    No versions created yet for this paper.{' '}
                    <Link
                      to={`/papers/${paperId}/configure`}
                      className="text-blue-600 underline font-medium"
                    >
                      Configure questions now &rarr;
                    </Link>
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
