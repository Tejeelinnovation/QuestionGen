import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DesktopLayout } from './desktop/DesktopLayout';
import { TabletLayout } from './tablet/TabletLayout';
import { MobileLayout } from './mobile/MobileLayout';

const PageLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[50vh] p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-forest/20 border-t-forest animate-spin" />
      <span className="text-[11px] font-mono text-ink/40 tracking-wider">LOADING...</span>
    </div>
  </div>
);

export const AppLayout: React.FC = () => {
  const breakpoint = useBreakpoint();

  const content = (
    <Suspense fallback={<PageLoadingFallback />}>
      <Outlet />
    </Suspense>
  );

  // On desktop breakpoint (>1024px), use the persistent desktop layout
  if (breakpoint === 'desktop') {
    return (
      <DesktopLayout key="desktop">
        {content}
      </DesktopLayout>
    );
  }

  // On tablet breakpoint (768–1024px), use the collapsible tablet layout
  if (breakpoint === 'tablet') {
    return (
      <TabletLayout key="tablet">
        {content}
      </TabletLayout>
    );
  }

  // On mobile breakpoint (<=767px), use the persistent bottom tab bar layout
  return (
    <MobileLayout key="mobile">
      {content}
    </MobileLayout>
  );
};

