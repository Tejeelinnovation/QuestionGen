import React from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { DatasetIngestionPageMobile } from './DatasetIngestionPageMobile';
import { DatasetIngestionPageTablet } from './DatasetIngestionPageTablet';
import { DatasetIngestionPageDesktop } from './DatasetIngestionPageDesktop';

/**
 * Root Responsive Switcher for Dataset Ingestion / Material Upload.
 * Follows the three-breakpoint architectural pattern:
 * - mobile:  ≤ 767px
 * - tablet:  768–1024px
 * - desktop: > 1024px
 */
export const DatasetIngestionPage: React.FC = () => {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'mobile') {
    return <DatasetIngestionPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <DatasetIngestionPageTablet key="tablet" />;
  }
  return <DatasetIngestionPageDesktop key="desktop" />;
};
