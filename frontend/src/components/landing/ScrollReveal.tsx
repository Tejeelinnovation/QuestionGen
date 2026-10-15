import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'zoom' | 'fade';
  delay?: number; // milliseconds
  duration?: number; // milliseconds
  className?: string;
  threshold?: number;
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  direction = 'up',
  delay = 0,
  duration = 600,
  className = '',
  threshold = 0.15,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once revealed, disconnect so it stays smoothly rendered
          if (ref.current) observer.unobserve(ref.current);
        }
      },
      {
        threshold,
        rootMargin: '0px 0px -40px 0px', // triggers slightly before scrolling fully past
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  const getHiddenTransform = () => {
    switch (direction) {
      case 'up':
        return 'translate-y-8 sm:translate-y-12 opacity-0';
      case 'down':
        return '-translate-y-8 sm:-translate-y-12 opacity-0';
      case 'left':
        return '-translate-x-6 sm:-translate-x-12 opacity-0';
      case 'right':
        return 'translate-x-6 sm:translate-x-12 opacity-0';
      case 'zoom':
        return 'scale-95 opacity-0';
      case 'fade':
      default:
        return 'opacity-0';
    }
  };

  const getVisibleTransform = () => {
    return 'translate-y-0 translate-x-0 scale-100 opacity-100';
  };

  return (
    <div
      ref={ref}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        transitionProperty: 'opacity, transform',
      }}
      className={`transform will-change-transform ${
        isVisible ? getVisibleTransform() : getHiddenTransform()
      } ${className}`}
    >
      {children}
    </div>
  );
};
