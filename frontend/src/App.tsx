import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppErrorBoundary } from './components/ui/RouteErrorBoundary';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
};

export default App;
