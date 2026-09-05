import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import { usersApi } from '../../api/users';
import type { Paper, User } from '../../types';

export const TeacherDashboard: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState<boolean>(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);
  const [papersError, setPapersError] = useState<string | null>(null);
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
                  <th className="border border-gray-300 p-2">Subject</th>
                  <th className="border border-gray-300 p-2">Grade</th>
                  <th className="border border-gray-300 p-2">Created At</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2">{p.id}</td>
                    <td className="border border-gray-300 p-2 font-medium">{p.title}</td>
                    <td className="border border-gray-300 p-2">{p.subject}</td>
                    <td className="border border-gray-300 p-2">Grade {p.grade}</td>
                    <td className="border border-gray-300 p-2 text-xs text-gray-600">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {papers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 p-4 text-center text-gray-500">
                      No question papers created yet. Click &quot;Create Test&quot; above to start.
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
