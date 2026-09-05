import React from 'react';
import { useParams, Link } from 'react-router-dom';

export const AttemptPlaceholder: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Online Test Attempt (Prompt 8 Placeholder)</h1>
      <p className="text-gray-700">
        This is a placeholder for the live test attempt sitting experience for Delivery #{id}.
        Interactive question-by-question answering, incremental auto-save, countdown timer, and test submission
        engine will be built out in Prompt 8.
      </p>
      <div>
        <Link to="/dashboard/student" className="text-blue-600 underline text-sm">
          &larr; Back to Student Dashboard
        </Link>
      </div>
    </div>
  );
};
