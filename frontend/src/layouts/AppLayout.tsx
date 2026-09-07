import React from 'react';
import { Outlet } from 'react-router-dom';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DesktopLayout } from './desktop/DesktopLayout';
import { TabletLayout } from './tablet/TabletLayout';
import { MobileLayout } from './mobile/MobileLayout';

export const AppLayout: React.FC = () => {
  const breakpoint = useBreakpoint();

  // On desktop breakpoint (>1024px), use the persistent desktop layout
  if (breakpoint === 'desktop') {
    return (
      <DesktopLayout key="desktop">
        <Outlet />
      </DesktopLayout>
    );
  }

  // On tablet breakpoint (768–1024px), use the collapsible tablet layout
  if (breakpoint === 'tablet') {
    return (
      <TabletLayout key="tablet">
        <Outlet />
      </TabletLayout>
    );
  }

  // On mobile breakpoint (<=767px), use the persistent bottom tab bar layout
  return (
    <MobileLayout key="mobile">
      <Outlet />
    </MobileLayout>
  );
};
