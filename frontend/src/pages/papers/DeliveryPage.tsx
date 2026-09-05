import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { usersApi } from '../../api/users';
import type { Delivery, PaperVersion, User } from '../../types';

export const DeliveryPage: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);

  const [version, setVersion] = useState<PaperVersion | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [mode, setMode] = useState<'ONLINE' | 'PRINT'>('ONLINE');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdDelivery, setCreatedDelivery] = useState<Delivery | null>(null);

  useEffect(() => {
    const loadVersionAndStudents = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const vData = await papersApi.getPaperVersion(paperId, vId);
        setVersion(vData);

        const usersData = await usersApi.getUsers();
        // Filter students in teacher scope
        const studentList = usersData.filter((u) => u.role_label === 'Student');
        setStudents(studentList);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load paper version or students list.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId && vId) {
      loadVersionAndStudents();
    }
  }, [paperId, vId]);

  const handleStudentToggle = (studentId: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((sId) => sId !== studentId) : [...prev, studentId]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map((s) => s.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'ONLINE' && selectedStudentIds.length === 0) {
      setErrorMessage('Please assign at least one student for online test delivery.');
      return;
    }

    setIsSubmitting(true);
    try {
      const deliveryPayload: any = {
        mode,
      };

      if (mode === 'ONLINE') {
        deliveryPayload.student_ids = selectedStudentIds;
        if (availableFrom) {
          deliveryPayload.available_from = new Date(availableFrom).toISOString();
        }
        if (availableUntil) {
          deliveryPayload.available_until = new Date(availableUntil).toISOString();
        }
      }

      const delivery = await papersApi.deliverVersion(paperId, vId, deliveryPayload);
      setCreatedDelivery(delivery);
    } catch (err: any) {
      const detail =
        err.response?.data?.student_ids?.[0] ||
        err.response?.data?.available_until?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to create test delivery.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Loading delivery configuration...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Deliver Question Paper</h1>
          {version && (
            <p className="text-sm text-gray-600 mt-1">
              Version: <strong>Version {version.version_label}</strong> &bull; Total Marks:{' '}
              {version.total_marks}
            </p>
          )}
        </div>
        <Link
          to={`/papers/${paperId}/versions/${vId}`}
          className="text-sm text-blue-600 underline"
        >
          &larr; Version Detail
        </Link>
      </div>

      {errorMessage && (
        <div
          id="delivery-error-banner"
          className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm"
        >
          {errorMessage}
        </div>
      )}

      {createdDelivery && (
        <div
          id="delivery-success-banner"
          className="border border-green-300 bg-green-50 text-green-900 p-5 space-y-4"
        >
          <h2 className="text-lg font-bold">Test Delivery Created Successfully!</h2>
          <p className="text-sm">
            Delivery #{createdDelivery.id} has been created in <strong>{createdDelivery.mode}</strong>{' '}
            mode for Version {createdDelivery.version_label}.
            {createdDelivery.mode === 'ONLINE' && (
              <span> Assigned to {createdDelivery.assigned_students?.length || 0} student(s).</span>
            )}
          </p>

          <div className="flex items-center space-x-4 pt-2">
            <Link
              to="/dashboard/teacher"
              className="border border-gray-400 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              Return to Teacher Dashboard
            </Link>

            {createdDelivery.mode === 'ONLINE' && (
              <Link
                to={`/deliveries/${createdDelivery.id}/results`}
                className="border border-blue-600 bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
              >
                View Results Roster &rarr;
              </Link>
            )}

            {createdDelivery.mode === 'PRINT' && (
              <Link
                to={`/papers/${paperId}/versions/${vId}/print`}
                className="border border-blue-500 bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
              >
                View Print Layout &rarr;
              </Link>
            )}
          </div>
        </div>
      )}

      {!createdDelivery && (
        <form onSubmit={handleSubmit} className="border border-gray-300 p-5 space-y-5">
          {/* Mode Selector */}
          <div>
            <label className="block text-sm font-semibold mb-2">Delivery Mode *</label>
            <div className="flex space-x-6">
              <label className="flex items-center space-x-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="delivery-mode"
                  value="ONLINE"
                  checked={mode === 'ONLINE'}
                  onChange={() => setMode('ONLINE')}
                  disabled={isSubmitting}
                />
                <span>Online Test (Students sit online)</span>
              </label>

              <label className="flex items-center space-x-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="delivery-mode"
                  value="PRINT"
                  checked={mode === 'PRINT'}
                  onChange={() => setMode('PRINT')}
                  disabled={isSubmitting}
                />
                <span>Print Paper (In-person physical paper)</span>
              </label>
            </div>
          </div>

          {/* ONLINE specific fields */}
          {mode === 'ONLINE' && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">Assign Students *</label>
                  {students.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllStudents}
                      className="text-xs text-blue-600 underline cursor-pointer"
                    >
                      {selectedStudentIds.length === students.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                <div className="border border-gray-300 p-3 max-h-48 overflow-y-auto space-y-1 bg-gray-50">
                  {students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(s.id)}
                        onChange={() => handleStudentToggle(s.id)}
                        disabled={isSubmitting}
                      />
                      <span>
                        <strong>{s.username}</strong>{' '}
                        {s.first_name || s.last_name
                          ? `(${[s.first_name, s.last_name].filter(Boolean).join(' ')})`
                          : ''}
                      </span>
                    </label>
                  ))}
                  {students.length === 0 && (
                    <div className="text-xs text-gray-500">
                      No students found in your school scope.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="avail-from">
                    Available From (Optional)
                  </label>
                  <input
                    id="avail-from"
                    type="datetime-local"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full border border-gray-400 px-2 py-1 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="avail-until">
                    Available Until (Optional)
                  </label>
                  <input
                    id="avail-until"
                    type="datetime-local"
                    value={availableUntil}
                    onChange={(e) => setAvailableUntil(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full border border-gray-400 px-2 py-1 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PRINT mode explanation */}
          {mode === 'PRINT' && (
            <div className="border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p>
                <strong>Print Delivery:</strong> Creates a formal test delivery record and enables
                generating print-ready paper layouts for physical exam distribution. No individual
                student account assignment is required.
              </p>
            </div>
          )}

          <div className="pt-2 flex justify-between items-center">
            <Link
              to={`/papers/${paperId}/versions/${vId}`}
              className="border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              id="submit-delivery-btn"
              disabled={isSubmitting}
              className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-5 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Delivering...' : 'Confirm & Deliver Test'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
