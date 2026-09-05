import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/users';
import type { User } from '../../types';

export const SuperAdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await usersApi.getUsers();
        setUsers(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load user accounts from the server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const countsByRole = users.reduce<Record<string, number>>((acc, u) => {
    const role = u.role_label || 'Unknown';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>

      {/* Schools section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-2">Schools Management</h2>
        <p className="text-sm text-gray-600 bg-gray-100 p-3 border border-gray-200">
          Schools list — endpoint pending. (Backend schools REST endpoint will be integrated when available).
        </p>
      </section>

      {/* Users & Counts section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-2">System User Statistics</h2>

        {isLoading && <div className="text-sm text-gray-600 py-2">Loading user data...</div>}

        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
            {errorMessage}
          </div>
        )}

        {!isLoading && !errorMessage && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <div className="border border-gray-300 p-3 bg-gray-50">
                <div className="text-xs text-gray-500">Total Users</div>
                <div className="text-xl font-bold">{users.length}</div>
              </div>
              {Object.entries(countsByRole).map(([role, count]) => (
                <div key={role} className="border border-gray-300 p-3 bg-gray-50">
                  <div className="text-xs text-gray-500">{role}</div>
                  <div className="text-xl font-bold">{count}</div>
                </div>
              ))}
            </div>

            <h3 className="text-md font-semibold pt-2">All Users</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="border border-gray-300 p-2">ID</th>
                    <th className="border border-gray-300 p-2">Username</th>
                    <th className="border border-gray-300 p-2">Role Label</th>
                    <th className="border border-gray-300 p-2">School ID</th>
                    <th className="border border-gray-300 p-2">Capabilities Count</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 p-2">{u.id}</td>
                      <td className="border border-gray-300 p-2 font-medium">{u.username}</td>
                      <td className="border border-gray-300 p-2">{u.role_label}</td>
                      <td className="border border-gray-300 p-2">{u.school ?? 'None (Global)'}</td>
                      <td className="border border-gray-300 p-2">{u.capabilities?.length || 0}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="border border-gray-300 p-4 text-center text-gray-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
