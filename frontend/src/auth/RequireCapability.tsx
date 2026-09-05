import React from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { CapabilityName } from '../types';

interface RequireCapabilityProps {
  capability?: CapabilityName;
  anyOf?: CapabilityName[];
  children: ReactNode;
}

export const RequireCapability: React.FC<RequireCapabilityProps> = ({ capability, anyOf, children }) => {
  const { user, isLoading, hasCapability } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="p-4 text-gray-600">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAuthorized = anyOf
    ? anyOf.some((cap) => hasCapability(cap))
    : capability
    ? hasCapability(capability)
    : true;

  if (!isAuthorized) {
    const requiredDisplay = anyOf ? anyOf.join(' or ') : capability;
    return (
      <div className="p-6 max-w-lg mx-auto my-8 border border-red-300 bg-red-50 text-red-800 rounded">
        <h2 className="text-xl font-bold mb-2">Not Authorized</h2>
        <p className="mb-4">
          You do not have the required permission (<code>{requiredDisplay}</code>) to view this page.
        </p>
        <a href="/" className="text-blue-600 underline">
          Return to home dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
