import React from 'react';

/**
 * DesktopLayout — placeholder shell for the Desktop breakpoint (> 1024px).
 * This will be replaced with the real desktop nav + sidebar in Prompt 2.
 */
export const DesktopLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="desktop-layout-shell">
      {children}
    </div>
  );
};
