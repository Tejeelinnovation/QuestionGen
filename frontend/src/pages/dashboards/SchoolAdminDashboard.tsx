import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import type { User } from '../../types';

export const SchoolAdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create Teacher form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail || 'Failed to load school users.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!username.trim() || !password.trim()) {
      setFormError('Username and password are required.');
      return;
    }

    setIsCreating(true);
    try {
      const newUser = await usersApi.createUser({
        username: username.trim(),
        password: password.trim(),
        profile: 'teacher',
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
      });

      setFormSuccess(`Teacher "${newUser.username}" created successfully.`);
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      // Refresh user list
      fetchUsers();
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        'Failed to create teacher account.';
      setFormError(detail);
    } finally {
      setIsCreating(false);
    }
  };

  // Teachers in school (backend scopes /api/users/ to school)
  const teachers = users.filter((u) => u.role_label === 'Teacher');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">School Admin Dashboard</h1>

      {/* Teachers List */}
      <section className="border border-gray-300 p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">School Teachers</h2>
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="border border-gray-400 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 cursor-pointer"
          >
            Refresh
          </button>
        </div>

        {isLoading && <div className="text-sm text-gray-600 py-2">Loading teachers...</div>}

        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
            {errorMessage}
          </div>
        )}

        {!isLoading && !errorMessage && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border border-gray-300 p-2">ID</th>
                  <th className="border border-gray-300 p-2">Username</th>
                  <th className="border border-gray-300 p-2">Name</th>
                  <th className="border border-gray-300 p-2">Email</th>
                  <th className="border border-gray-300 p-2">Role</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2">{t.id}</td>
                    <td className="border border-gray-300 p-2 font-medium">{t.username}</td>
                    <td className="border border-gray-300 p-2">
                      {[t.first_name, t.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="border border-gray-300 p-2">{t.email || '—'}</td>
                    <td className="border border-gray-300 p-2">{t.role_label}</td>
                  </tr>
                ))}
                {teachers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 p-4 text-center text-gray-500">
                      No teachers found in this school.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Teacher Form */}
      <section className="border border-gray-300 p-4 max-w-lg">
        <h2 className="text-lg font-semibold mb-3">Create New Teacher</h2>

        {formSuccess && (
          <div className="border border-green-300 bg-green-50 text-green-800 p-3 text-sm mb-3">
            {formSuccess}
          </div>
        )}

        {formError && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-3">
            {formError}
          </div>
        )}

        <form onSubmit={handleCreateTeacher} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="t-username">
              Username *
            </label>
            <input
              id="t-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isCreating}
              className="w-full border border-gray-400 px-2 py-1 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="t-password">
              Password *
            </label>
            <input
              id="t-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isCreating}
              className="w-full border border-gray-400 px-2 py-1 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="t-fname">
                First Name
              </label>
              <input
                id="t-fname"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isCreating}
                className="w-full border border-gray-400 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="t-lname">
                Last Name
              </label>
              <input
                id="t-lname"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isCreating}
                className="w-full border border-gray-400 px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="t-email">
              Email
            </label>
            <input
              id="t-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isCreating}
              className="w-full border border-gray-400 px-2 py-1 text-sm"
            />
          </div>

          <button
            type="submit"
            id="create-teacher-btn"
            disabled={isCreating}
            className="border border-gray-400 bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
          >
            {isCreating ? 'Creating Teacher...' : 'Create Teacher'}
          </button>
        </form>
      </section>
    </div>
  );
};
