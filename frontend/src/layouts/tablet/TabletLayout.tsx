import React from 'react';

/**
 * TabletLayout — placeholder shell for the Tablet breakpoint (768–1024px).
 * This will be replaced with the real tablet nav in Prompt 2.
 */
export const TabletLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="tablet-layout-shell">
      {children}
    </div>
  );
};
