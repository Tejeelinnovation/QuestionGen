import { useState, useEffect, useRef } from 'react';

interface UseExamCountdownOptions {
  startedAt?: string;
  durationMinutes?: number;
  availableUntil?: string | null;
  onTimeExpired?: () => void;
}

export const useExamCountdown = ({
  startedAt,
  durationMinutes = 60,
  availableUntil,
  onTimeExpired,
}: UseExamCountdownOptions) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (!startedAt) return;

    const calculateRemaining = () => {
      const startMs = new Date(startedAt).getTime();
      const durationMs = (durationMinutes || 60) * 60 * 1000;
      let targetDeadlineMs = startMs + durationMs;

      if (availableUntil) {
        const availMs = new Date(availableUntil).getTime();
        if (!isNaN(availMs) && availMs < targetDeadlineMs) {
          targetDeadlineMs = availMs;
        }
      }

      const diffSecs = Math.max(0, Math.floor((targetDeadlineMs - Date.now()) / 1000));
      return diffSecs;
    };

    const initialRemaining = calculateRemaining();
    setSecondsRemaining(initialRemaining);

    if (initialRemaining <= 0 && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onTimeExpired?.();
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsRemaining(remaining);

      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        clearInterval(interval);
        onTimeExpired?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, durationMinutes, availableUntil, onTimeExpired]);

  const formatTime = (totalSeconds: number | null) => {
    if (totalSeconds === null) return '--:--';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  return {
    secondsRemaining,
    formattedTime: formatTime(secondsRemaining),
    isUrgent: secondsRemaining !== null && secondsRemaining <= 300, // <= 5 minutes
    isExpired: secondsRemaining !== null && secondsRemaining <= 0,
  };
};
