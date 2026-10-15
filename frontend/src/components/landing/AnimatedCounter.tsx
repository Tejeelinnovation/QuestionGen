import React, { useState, useEffect, useRef } from 'react';

interface AnimatedCounterProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  decimals?: number;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  end,
  duration = 1800,
  prefix = '',
  suffix = '',
  className = '',
  decimals = 0,
}) => {
  const [value, setValue] = useState<number>(0);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  // Trigger animation only when scrolled into view
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setHasStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStarted(true);
          if (spanRef.current) observer.unobserve(spanRef.current);
        }
      },
      {
        threshold: 0.15,
      }
    );

    if (spanRef.current) {
      observer.observe(spanRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!hasStarted) return;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = timestamp - startTimeRef.current;
      const rate = Math.min(progress / duration, 1);
      
      // Easing: easeOutExpo for energetic start and smooth landing
      const ease = rate === 1 ? 1 : 1 - Math.pow(2, -10 * rate);
      const current = ease * end;

      setValue(current);

      if (rate < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [hasStarted, end, duration]);

  const formatted = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();

  return (
    <span ref={spanRef} className={`inline-block tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

