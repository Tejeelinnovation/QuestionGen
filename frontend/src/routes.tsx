import React from 'react';
import { Navigate, Link, type RouteObject } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequireCapability } from './auth/RequireCapability';
import { useAuth } from './auth/AuthContext';

// Top-level suspense boundary fallback for unauthenticated routes (e.g. /login)
const TopLevelSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense
    fallback={
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-forest/20 border-t-forest animate-spin" />
          <span className="text-[11px] font-mono text-ink/40 tracking-wider">LOADING...</span>
        </div>
      </div>
    }
  >
    {children}
  </React.Suspense>
);

// Route-level code splitting via dynamic imports
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SuperAdminDashboard = React.lazy(() => import('./pages/dashboards/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const SchoolAdminDashboard = React.lazy(() => import('./pages/dashboards/SchoolAdminDashboard').then(m => ({ default: m.SchoolAdminDashboard })));
const TeacherDashboard = React.lazy(() => import('./pages/dashboards/TeacherDashboard').then(m => ({ default: m.TeacherDashboard })));
const StudentDashboard = React.lazy(() => import('./pages/dashboards/StudentDashboard').then(m => ({ default: m.StudentDashboard })));
const QBMDashboard = React.lazy(() => import('./pages/dashboards/QBMDashboard').then(m => ({ default: m.QBMDashboard })));
const TestAttemptPage = React.lazy(() => import('./pages/attempts/TestAttemptPage').then(m => ({ default: m.TestAttemptPage })));
const ResultPage = React.lazy(() => import('./pages/attempts/ResultPage').then(m => ({ default: m.ResultPage })));
const ResultsRosterPage = React.lazy(() => import('./pages/attempts/ResultsRosterPage').then(m => ({ default: m.ResultsRosterPage })));
const GradeAttemptPage = React.lazy(() => import('./pages/attempts/GradeAttemptPage').then(m => ({ default: m.GradeAttemptPage })));
const PaperSetupPage = React.lazy(() => import('./pages/papers/PaperSetupPage').then(m => ({ default: m.PaperSetupPage })));
const PaperConfigurePage = React.lazy(() => import('./pages/papers/PaperConfigurePage').then(m => ({ default: m.PaperConfigurePage })));
const QuestionReviewPage = React.lazy(() => import('./pages/papers/QuestionReviewPage').then(m => ({ default: m.QuestionReviewPage })));
const VersionDetailPage = React.lazy(() => import('./pages/papers/VersionDetailPage').then(m => ({ default: m.VersionDetailPage })));
const DeliveryPage = React.lazy(() => import('./pages/papers/DeliveryPage').then(m => ({ default: m.DeliveryPage })));
const PrintViewPage = React.lazy(() => import('./pages/papers/PrintViewPage').then(m => ({ default: m.PrintViewPage })));
const PaperDetailPage = React.lazy(() => import('./pages/papers/PaperDetailPage').then(m => ({ default: m.PaperDetailPage })));
const ProfilePage = React.lazy(() => import('./pages/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const ResetPasswordPage = React.lazy(() => import('./pages/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const DatasetIngestionPage = React.lazy(() => import('./pages/ingestion/DatasetIngestionPage').then(m => ({ default: m.DatasetIngestionPage })));

/**
 * Root index redirector: resolves the starting dashboard based on the user's
 * specific capabilities - NEVER on role_label.
 */
const DashboardIndexRedirect: React.FC = () => {
  const { user, dashboardPath, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-gray-600">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={dashboardPath} replace />;
};

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <TopLevelSuspense>
        <LoginPage />
      </TopLevelSuspense>
    ),
  },
  {
    path: '/reset-password',
    element: (
      <TopLevelSuspense>
        <ResetPasswordPage />
      </TopLevelSuspense>
    ),
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
        path: 'dashboard/qbm',
        element: (
          <RequireCapability anyOf={['INGEST_GLOBAL_QUESTIONS', 'DATA_ENTRY_OPERATOR', 'VALIDATOR']}>
            <QBMDashboard />
          </RequireCapability>
        ),
      },
      {
        path: 'qbm/validation-queue',
        element: (
          <RequireCapability capability="VALIDATOR">
            <QBMDashboard initialTab="validation" />
          </RequireCapability>
        ),
      },
      {
        path: 'qbm/my-submissions',
        element: (
          <RequireCapability capability="DATA_ENTRY_OPERATOR">
            <QBMDashboard initialTab="submissions" />
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
          <RequireCapability anyOf={['ASSIGN_TEST', 'CREATE_PAPER', 'VIEW_SCHOOL_WIDE_CONTROLS']}>
            <ResultsRosterPage />
          </RequireCapability>
        ),
      },
      {
        path: 'attempts/:id/grade',
        element: (
          <RequireCapability anyOf={['ASSIGN_TEST', 'CREATE_PAPER', 'VIEW_SCHOOL_WIDE_CONTROLS']}>
            <GradeAttemptPage />
          </RequireCapability>
        ),
      },
      {
        path: 'attempts/:id/result',
        element: (
          <RequireCapability anyOf={['VIEW_OWN_RESULT', 'ASSIGN_TEST', 'CREATE_PAPER', 'VIEW_SCHOOL_WIDE_CONTROLS']}>
            <ResultPage />
          </RequireCapability>
        ),
      },
      {
        path: 'dataset-ingestion',
        element: (
          <RequireCapability anyOf={['UPLOAD_STUDY_MATERIAL', 'CREATE_SCHOOL']}>
            <DatasetIngestionPage />
          </RequireCapability>
        ),
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: '*',
        element: (
          <div className="min-h-[70vh] flex items-center justify-center p-6 text-center font-body animate-fade-in">
            <div className="max-w-md w-full bg-surface border border-border rounded-2xl shadow-float p-8 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-forest/10 border border-forest/20 text-forest flex items-center justify-center mx-auto">
                <span className="font-heading font-black text-lg">404</span>
              </div>
              <div className="space-y-1">
                <h2 className="font-heading font-bold text-lg text-ink">Page Not Found</h2>
                <p className="text-xs text-ink/60">
                  The page you are looking for doesn't exist or may have been moved.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
];
