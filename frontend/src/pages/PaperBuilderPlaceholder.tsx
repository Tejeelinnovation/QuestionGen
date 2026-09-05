import React from 'react';
import { Link } from 'react-router-dom';

export const PaperBuilderPlaceholder: React.FC = () => {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paper Builder (Prompt 7 Placeholder)</h1>
      <p className="text-gray-700">
        This is a placeholder for the full paper generation, question selection, blueprint configuration,
        and versioning workflow UI.
      </p>
      <div>
        <Link to="/dashboard/teacher" className="text-blue-600 underline text-sm">
          &larr; Back to Teacher Dashboard
        </Link>
      </div>
    </div>
  );
};
