import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { usersApi } from '../../api/users';
import type { Paper, User, Delivery } from '../../types';

export const TeacherDashboard: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState<boolean>(true);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPapers = async () => {
      setIsLoadingPapers(true);
      setPapersError(null);
      try {
        const data = await papersApi.getPapers();
        setPapers(data);
      } catch (err: any) {
        setPapersError(err.response?.data?.detail || 'Failed to load question papers.');
      } finally {
        setIsLoadingPapers(false);
      }
    };

    const fetchDeliveries = async () => {
      setIsLoadingDeliveries(true);
      setDeliveriesError(null);
      try {
        const data = await papersApi.getDeliveries();
        setDeliveries(data);
      } catch (err: any) {
        setDeliveriesError(err.response?.data?.detail || 'Failed to load deliveries.');
      } finally {
        setIsLoadingDeliveries(false);
      }
    };

    const fetchStudents = async () => {
      setIsLoadingStudents(true);
      setStudentsError(null);
      try {
        const data = await usersApi.getUsers();
        // Backend scopes users for teacher to students
        setStudents(data.filter((u) => u.role_label === 'Student'));
      } catch (err: any) {
        setStudentsError(err.response?.data?.detail || 'Failed to load students.');
      } finally {
        setIsLoadingStudents(false);
      }
    };

    fetchPapers();
    fetchDeliveries();
    fetchStudents();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
        <Link
          to="/papers/new"
          id="create-test-btn"
          className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-4 py-2 text-sm font-medium"
        >
          Create Test
        </Link>
      </div>

      {/* Papers Section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-3">My Question Papers</h2>

        {isLoadingPapers && <div className="text-sm text-gray-600 py-2">Loading papers...</div>}

        {papersError && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
            {papersError}
          </div>
        )}

        {!isLoadingPapers && !papersError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 p-2">ID</th>
                  <th className="border border-gray-300 p-2">Title</th>
                  <th className="border border-gray-300 p-2">Chapter</th>
                  <th className="border border-gray-300 p-2">Versions</th>
                  <th className="border border-gray-300 p-2">Created At</th>
                  <th className="border border-gray-300 p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2">{p.id}</td>
                    <td className="border border-gray-300 p-2 font-medium">
                      <Link
                        to={`/papers/${p.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="border border-gray-300 p-2">{p.chapter_title || `Chapter #${p.chapter}`}</td>
                    <td className="border border-gray-300 p-2">
                      <span className="border border-gray-300 px-2 py-0.5 text-xs bg-gray-100 font-semibold">
                        {p.version_count ?? 0}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2 text-xs text-gray-600">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="border border-gray-300 p-2">
                      <Link
                        to={`/papers/${p.id}`}
                        className="border border-gray-300 bg-gray-50 hover:bg-gray-100 px-2 py-1 text-xs inline-block font-medium"
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
                {papers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border border-gray-300 p-4 text-center text-gray-500">
                      No question papers created yet. Click &quot;Create Test&quot; above to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Deliveries & Results Section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-3">Test Deliveries & Results</h2>

        {isLoadingDeliveries && (
          <div className="text-sm text-gray-600 py-2">Loading deliveries...</div>
        )}

        {deliveriesError && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
            {deliveriesError}
          </div>
        )}

        {!isLoadingDeliveries && !deliveriesError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 p-2">Delivery ID</th>
                  <th className="border border-gray-300 p-2">Paper / Version</th>
                  <th className="border border-gray-300 p-2">Mode</th>
                  <th className="border border-gray-300 p-2">Assigned Students</th>
                  <th className="border border-gray-300 p-2">Created</th>
                  <th className="border border-gray-300 p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2 font-mono">#{d.id}</td>
                    <td className="border border-gray-300 p-2 font-medium">
                      {d.paper_title || 'Paper'} (Ver. {d.version_label})
                    </td>
                    <td className="border border-gray-300 p-2">
                      <span
                        className={`text-xs px-2 py-0.5 border font-semibold ${
                          d.mode === 'ONLINE'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-gray-100 text-gray-800 border-gray-300'
                        }`}
                      >
                        {d.mode}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2">
                      {d.assigned_students?.length || 0} student(s)
                    </td>
                    <td className="border border-gray-300 p-2 text-xs text-gray-600">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="border border-gray-300 p-2 space-x-2">
                      {d.mode === 'ONLINE' ? (
                        <Link
                          to={`/deliveries/${d.id}/results`}
                          className="border border-blue-500 bg-blue-50 hover:bg-blue-100 text-blue-800 px-2 py-1 text-xs inline-block font-medium"
                        >
                          Results Roster &rarr;
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-500 italic">Print Only</span>
                      )}
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-gray-300 p-4 text-center text-gray-500"
                    >
                      No deliveries scheduled yet. Deliver a finalized paper version to view results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Students Section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-3">Assigned Students</h2>

        {isLoadingStudents && <div className="text-sm text-gray-600 py-2">Loading students...</div>}

        {studentsError && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
            {studentsError}
          </div>
        )}

        {!isLoadingStudents && !studentsError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 p-2">ID</th>
                  <th className="border border-gray-300 p-2">Username</th>
                  <th className="border border-gray-300 p-2">Full Name</th>
                  <th className="border border-gray-300 p-2">Email</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2">{s.id}</td>
                    <td className="border border-gray-300 p-2 font-medium">{s.username}</td>
                    <td className="border border-gray-300 p-2">
                      {[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="border border-gray-300 p-2">{s.email || '—'}</td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={4} className="border border-gray-300 p-4 text-center text-gray-500">
                      No students found in your scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
