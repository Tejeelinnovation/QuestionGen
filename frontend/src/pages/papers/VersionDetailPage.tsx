import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { useAuth } from '../../auth/AuthContext';
import type { PaperVersion } from '../../types';

export const VersionDetailPage: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);
  const navigate = useNavigate();
  const { hasCapability } = useAuth();

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchVersion = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await papersApi.getPaperVersion(paperId, vId);
      setVersion(data);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load paper version details from server.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (paperId && vId) {
      fetchVersion();
    }
  }, [paperId, vId]);

  const handleFinalize = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setActionLoading(true);
    try {
      const updated = await papersApi.finalizeVersion(paperId, vId);
      setVersion(updated);
      setSuccessMessage(`Version ${updated.version_label} has been finalized successfully.`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        (typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data)) ||
        'Failed to finalize version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloneSame = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setActionLoading(true);
    try {
      const cloned = await papersApi.cloneVersion(paperId, vId, {});
      navigate(`/papers/${paperId}/versions/${cloned.id}`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to clone version.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading version details...</div>;
  }

  if (!version) {
    return (
      <div className="p-4">
        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
            {errorMessage}
          </div>
        )}
        <Link to={`/papers/${paperId}`} className="text-blue-600 underline text-sm">
          &larr; Back to Paper
        </Link>
      </div>
    );
  }

  const isDraft = version.status === 'DRAFT';
  const isFinalized = version.status === 'FINALIZED';
  const canCreatePaper = hasCapability('CREATE_PAPER');
  const canAssignTest = hasCapability('ASSIGN_TEST');

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold">
              {version.paper_title || `Paper #${paperId}`} — Version {version.version_label}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 border font-semibold ${
                isFinalized
                  ? 'border-green-400 bg-green-50 text-green-800'
                  : 'border-yellow-400 bg-yellow-50 text-yellow-800'
              }`}
            >
              {version.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Created on {new Date(version.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex space-x-3 text-sm">
          <Link to={`/papers/${paperId}`} className="text-blue-600 underline">
            &larr; Paper Versions
          </Link>
          <Link to="/dashboard/teacher" className="text-blue-600 underline">
            Teacher Dashboard
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div
          id="version-error-banner"
          className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm"
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          id="version-success-banner"
          className="border border-green-300 bg-green-50 text-green-800 p-3 text-sm"
        >
          {successMessage}
        </div>
      )}

      {/* Meta & Stats bar */}
      <div className="border border-gray-300 bg-gray-50 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-gray-500">Version Label</div>
          <div className="text-lg font-bold">Version {version.version_label}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Total Marks</div>
          <div className="text-lg font-bold" id="version-total-marks">
            {version.total_marks}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Total Questions</div>
          <div className="text-lg font-bold" id="version-question-count">
            {version.question_snapshot?.length || version.question_count || 0}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Lifecycle Status</div>
          <div className="text-lg font-bold">{version.status}</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="border border-gray-300 p-3 bg-white flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xs font-semibold text-gray-600 uppercase">Actions:</span>

        {/* Finalize Button (only if DRAFT) */}
        {isDraft && canCreatePaper && (
          <button
            onClick={handleFinalize}
            id="finalize-version-btn"
            disabled={actionLoading}
            className="border border-green-500 bg-green-50 hover:bg-green-100 text-green-900 px-3 py-1 font-medium cursor-pointer disabled:opacity-50"
          >
            {actionLoading ? 'Finalizing...' : 'Finalize Version'}
          </button>
        )}

        {/* Deliver Button (only if FINALIZED) */}
        {isFinalized && canAssignTest && (
          <Link
            to={`/papers/${paperId}/versions/${vId}/deliver`}
            id="deliver-version-link"
            className="border border-blue-500 bg-blue-50 hover:bg-blue-100 text-blue-900 px-3 py-1 font-medium"
          >
            Deliver Test &rarr;
          </Link>
        )}

        {/* Print Button (only if FINALIZED) */}
        {isFinalized && (
          <Link
            to={`/papers/${paperId}/versions/${vId}/print`}
            id="print-layout-link"
            className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-3 py-1 font-medium"
          >
            View Print Layout
          </Link>
        )}

        {/* Clone options */}
        {canCreatePaper && (
          <div className="flex items-center space-x-2 border-l border-gray-300 pl-3">
            <button
              onClick={handleCloneSame}
              id="clone-version-btn"
              disabled={actionLoading}
              className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-3 py-1 cursor-pointer disabled:opacity-50"
              title="Clone this version creating Version B/C with the same question pool"
            >
              Clone as New Version
            </button>
            <Link
              to={`/papers/${paperId}/configure`}
              className="text-xs text-blue-600 underline"
            >
              or Configure Fresh Questions
            </Link>
          </div>
        )}
      </div>

      {/* Questions Snapshot display */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Immutable Question Snapshot</h2>

        <div className="space-y-3">
          {version.question_snapshot?.map((q, idx) => (
            <div key={q.question_id || idx} className="border border-gray-300 p-4 bg-white space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-600 border-b border-gray-100 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-black">Q{idx + 1}.</span>
                  <span className="border border-gray-300 px-1.5 py-0.5 bg-gray-100">
                    {q.question_type}
                  </span>
                  <span className="border border-gray-300 px-1.5 py-0.5 bg-gray-100">
                    {q.difficulty}
                  </span>
                </div>
                <span className="font-bold text-black text-sm">Marks: {q.marks}</span>
              </div>

              <p className="text-sm font-medium pt-1">{q.question_text}</p>

              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 pl-2">
                  {Object.entries(q.options).map(([optKey, optVal]) => (
                    <div key={optKey} className="border border-gray-200 p-2 bg-gray-50">
                      <strong>({optKey})</strong> {optVal}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {(!version.question_snapshot || version.question_snapshot.length === 0) && (
            <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              No questions snapshot stored in this version.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
