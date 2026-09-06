import React from 'react';

/**
 * MobileLayout — placeholder shell for the Mobile breakpoint (≤ 767px).
 * This will be replaced with the real mobile nav in Prompt 2.
 */
export const MobileLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="mobile-layout-shell">
      {children}
    </div>
  );
};
