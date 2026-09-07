import React from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ProfilePageDesktop } from './ProfilePageDesktop';
import { ProfilePageTablet } from './ProfilePageTablet';
import { ProfilePageMobile } from './ProfilePageMobile';

export const ProfilePage: React.FC = () => {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'mobile') {
    return <ProfilePageMobile key="mobile" />;
  }

  if (breakpoint === 'tablet') {
    return <ProfilePageTablet key="tablet" />;
  }

  return <ProfilePageDesktop key="desktop" />;
};
