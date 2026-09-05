import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { deliveriesApi } from '../../api/deliveries';
import type { Delivery } from '../../types';

export const StudentDashboard: React.FC = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeliveries = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await deliveriesApi.getDeliveries();
        setDeliveries(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load assigned tests and deliveries.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeliveries();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Student Dashboard</h1>

      {/* Assigned Tests Section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-3">Assigned Tests</h2>

        {isLoading && <div className="text-sm text-gray-600 py-2">Loading assigned tests...</div>}

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
                  <th className="border border-gray-300 p-2">Delivery ID</th>
                  <th className="border border-gray-300 p-2">Test Title</th>
                  <th className="border border-gray-300 p-2">Mode</th>
                  <th className="border border-gray-300 p-2">Available Window</th>
                  <th className="border border-gray-300 p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-2">{d.id}</td>
                    <td className="border border-gray-300 p-2 font-medium">{d.title}</td>
                    <td className="border border-gray-300 p-2">
                      <span className="border border-gray-400 px-2 py-0.5 text-xs">
                        {d.mode}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2 text-xs text-gray-600">
                      {d.available_from ? new Date(d.available_from).toLocaleString() : 'Now'}
                      {' - '}
                      {d.available_until ? new Date(d.available_until).toLocaleString() : 'No expiry'}
                    </td>
                    <td className="border border-gray-300 p-2">
                      <Link
                        to={`/deliveries/${d.id}/attempt`}
                        className="inline-block border border-gray-400 bg-gray-100 hover:bg-gray-200 px-3 py-1 text-xs font-medium"
                      >
                        Start / Resume
                      </Link>
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 p-4 text-center text-gray-500">
                      No active tests assigned to you.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Past Results Section */}
      <section className="border border-gray-300 p-4">
        <h2 className="text-lg font-semibold mb-2">Past Results</h2>
        <p className="text-sm text-gray-600 bg-gray-100 p-3 border border-gray-200">
          Individual attempt results and feedback are available directly after submission.
          Comprehensive test results review screen will be expanded in upcoming iterations.
        </p>
      </section>
    </div>
  );
};
