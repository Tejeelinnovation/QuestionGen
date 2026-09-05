import React from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { SuperAdminDashboard } from './pages/dashboards/SuperAdminDashboard';
import { SchoolAdminDashboard } from './pages/dashboards/SchoolAdminDashboard';
import { TeacherDashboard } from './pages/dashboards/TeacherDashboard';
import { StudentDashboard } from './pages/dashboards/StudentDashboard';
import { TestAttemptPage } from './pages/attempts/TestAttemptPage';
import { ResultPage } from './pages/attempts/ResultPage';
import { ResultsRosterPage } from './pages/attempts/ResultsRosterPage';
import { GradeAttemptPage } from './pages/attempts/GradeAttemptPage';
import { PaperSetupPage } from './pages/papers/PaperSetupPage';
import { PaperConfigurePage } from './pages/papers/PaperConfigurePage';
import { QuestionReviewPage } from './pages/papers/QuestionReviewPage';
import { VersionDetailPage } from './pages/papers/VersionDetailPage';
import { DeliveryPage } from './pages/papers/DeliveryPage';
import { PrintViewPage } from './pages/papers/PrintViewPage';
import { PaperDetailPage } from './pages/papers/PaperDetailPage';
import { RequireCapability } from './auth/RequireCapability';
import { useAuth } from './auth/AuthContext';

/**
 * Root index redirector: resolves the starting dashboard based on the user's
 * specific capabilities — NEVER on role_label.
 */
const DashboardIndexRedirect: React.FC = () => {
  const { user, isLoading, hasCapability } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-gray-600">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (hasCapability('CREATE_SCHOOL')) {
    return <Navigate to="/dashboard/super-admin" replace />;
  }
  if (hasCapability('VIEW_SCHOOL_WIDE_CONTROLS')) {
    return <Navigate to="/dashboard/school-admin" replace />;
  }
  if (hasCapability('CREATE_PAPER')) {
    return <Navigate to="/dashboard/teacher" replace />;
  }
  if (hasCapability('ATTEMPT_TEST')) {
    return <Navigate to="/dashboard/student" replace />;
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-2">Welcome</h2>
      <p>No dashboard mapped for your current capability set.</p>
    </div>
  );
};

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <DashboardIndexRedirect />,
      },
      {
        path: 'dashboard/super-admin',
        element: (
          <RequireCapability capability="CREATE_SCHOOL">
            <SuperAdminDashboard />
          </RequireCapability>
        ),
      },
      {
        path: 'dashboard/school-admin',
        element: (
          <RequireCapability capability="VIEW_SCHOOL_WIDE_CONTROLS">
            <SchoolAdminDashboard />
          </RequireCapability>
        ),
      },
      {
        path: 'dashboard/teacher',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <TeacherDashboard />
          </RequireCapability>
        ),
      },
      {
        path: 'dashboard/student',
        element: (
          <RequireCapability capability="ATTEMPT_TEST">
            <StudentDashboard />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/new',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <PaperSetupPage />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/:id',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <PaperDetailPage />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/:id/configure',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <PaperConfigurePage />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/:id/review',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <QuestionReviewPage />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/:id/versions/:versionId',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <VersionDetailPage />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/:id/versions/:versionId/deliver',
        element: (
          <RequireCapability capability="ASSIGN_TEST">
            <DeliveryPage />
          </RequireCapability>
        ),
      },
      {
        path: 'papers/:id/versions/:versionId/print',
        element: (
          <RequireCapability capability="CREATE_PAPER">
            <PrintViewPage />
          </RequireCapability>
        ),
      },
      {
        path: 'deliveries/:id/attempt',
        element: (
          <RequireCapability capability="ATTEMPT_TEST">
            <TestAttemptPage />
          </RequireCapability>
        ),
      },
      {
        path: 'deliveries/:id/results',
        element: (
          <RequireCapability anyOf={['ASSIGN_TEST', 'CREATE_PAPER']}>
            <ResultsRosterPage />
          </RequireCapability>
        ),
      },
      {
        path: 'attempts/:id/grade',
        element: (
          <RequireCapability anyOf={['ASSIGN_TEST', 'CREATE_PAPER']}>
            <GradeAttemptPage />
          </RequireCapability>
        ),
      },
      {
        path: 'attempts/:id/result',
        element: (
          <RequireCapability capability="VIEW_OWN_RESULT">
            <ResultPage />
          </RequireCapability>
        ),
      },
      {
        path: '*',
        element: (
          <div className="p-6">
            <h2 className="text-xl font-bold">404 - Page Not Found</h2>
            <p className="mt-2">The requested page does not exist.</p>
          </div>
        ),
      },
    ],
  },
];
