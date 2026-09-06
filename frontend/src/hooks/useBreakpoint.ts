import { useState, useEffect } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 767;
const TABLET_MAX = 1024;

function getBreakpoint(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

/**
 * useBreakpoint — returns the current viewport breakpoint based on real
 * window width, not CSS classes.
 *
 * Breakpoints:
 *   mobile:  ≤ 767px
 *   tablet:  768–1024px
 *   desktop: > 1024px
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    getBreakpoint(typeof window !== 'undefined' ? window.innerWidth : 1280)
  );

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };

    // Use ResizeObserver on document.documentElement for reliable detection
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setBreakpoint(getBreakpoint(entry.contentRect.width));
      }
    });

    observer.observe(document.documentElement);
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return breakpoint;
}
