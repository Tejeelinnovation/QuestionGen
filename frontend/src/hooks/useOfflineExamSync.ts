import { useState, useEffect, useCallback, useRef } from 'react';
import { attemptsApi } from '../api/attempts';

export interface QueuedAnswer {
  questionId: number;
  responseText: string;
  timestamp: number;
}

interface UseOfflineExamSyncOptions {
  deliveryId: number;
  attemptId?: number;
  onAnswerSaved?: (questionId: number) => void;
  onAnswerSaveError?: (questionId: number, error: any) => void;
}

export function useOfflineExamSync({
  deliveryId,
  attemptId,
  onAnswerSaved,
  onAnswerSaveError,
}: UseOfflineExamSyncOptions) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const storageKeyBackup = `qgen_exam_backup_${deliveryId}_${attemptId || 'pending'}`;
  const storageKeyQueue = `qgen_exam_queue_${deliveryId}_${attemptId || 'pending'}`;

  // Flush in-flight guard to avoid concurrent flushes
  const isFlushingRef = useRef(false);

  // Read queue from localStorage
  const getStoredQueue = useCallback((): QueuedAnswer[] => {
    try {
      const raw = localStorage.getItem(storageKeyQueue);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [storageKeyQueue]);

  // Read backup answers from localStorage
  const getStoredAnswers = useCallback((): Record<number, string> => {
    try {
      const raw = localStorage.getItem(storageKeyBackup);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [storageKeyBackup]);

  // Save backup answers to localStorage
  const saveStoredAnswers = useCallback(
    (answers: Record<number, string>) => {
      try {
        localStorage.setItem(storageKeyBackup, JSON.stringify(answers));
      } catch (err) {
        console.warn('Failed to backup exam answers to localStorage:', err);
      }
    },
    [storageKeyBackup]
  );

  // Save queue to localStorage and update count
  const setStoredQueue = useCallback(
    (queue: QueuedAnswer[]) => {
      try {
        localStorage.setItem(storageKeyQueue, JSON.stringify(queue));
      } catch (err) {
        console.warn('Failed to save exam sync queue to localStorage:', err);
      }
      setPendingCount(queue.length);
    },
    [storageKeyQueue]
  );

  // Flush queued answers to server
  const flushQueue = useCallback(async () => {
    if (!attemptId || isFlushingRef.current) return;
    const currentQueue = getStoredQueue();
    if (currentQueue.length === 0) {
      setPendingCount(0);
      return;
    }

    isFlushingRef.current = true;
    setIsSyncing(true);

    const remainingQueue: QueuedAnswer[] = [];

    for (const item of currentQueue) {
      try {
        await attemptsApi.saveAnswer(attemptId, item.questionId, item.responseText);
        onAnswerSaved?.(item.questionId);
      } catch (err: any) {
        console.error(`Failed to sync queued answer for Q#${item.questionId}:`, err);
        remainingQueue.push(item);
        onAnswerSaveError?.(item.questionId, err);
      }
    }

    setStoredQueue(remainingQueue);
    setIsSyncing(false);
    isFlushingRef.current = false;
    setLastSyncedAt(new Date());
  }, [attemptId, getStoredQueue, setStoredQueue, onAnswerSaved, onAnswerSaveError]);

  // Save an answer: stores locally immediately, then attempts network save or queues
  const saveAnswer = useCallback(
    async (questionId: number, responseText: string) => {
      // 1. Always back up to local storage first
      const currentAnswers = getStoredAnswers();
      currentAnswers[questionId] = responseText;
      saveStoredAnswers(currentAnswers);

      // 2. If completely offline or no attemptId yet, append to queue
      if (!isOnline || !attemptId) {
        const queue = getStoredQueue().filter((q) => q.questionId !== questionId);
        queue.push({
          questionId,
          responseText,
          timestamp: Date.now(),
        });
        setStoredQueue(queue);
        return;
      }

      // 3. Try online save
      try {
        await attemptsApi.saveAnswer(attemptId, questionId, responseText);
        // Remove from queue if it was pending
        const queue = getStoredQueue().filter((q) => q.questionId !== questionId);
        setStoredQueue(queue);
        onAnswerSaved?.(questionId);
        setLastSyncedAt(new Date());
      } catch (err: any) {
        console.warn(`Online save failed for Q#${questionId}, queuing offline retry...`, err);
        const queue = getStoredQueue().filter((q) => q.questionId !== questionId);
        queue.push({
          questionId,
          responseText,
          timestamp: Date.now(),
        });
        setStoredQueue(queue);
        onAnswerSaveError?.(questionId, err);
      }
    },
    [
      isOnline,
      attemptId,
      getStoredAnswers,
      saveStoredAnswers,
      getStoredQueue,
      setStoredQueue,
      onAnswerSaved,
      onAnswerSaveError,
    ]
  );

  // Clear offline cache upon successful exam submission
  const clearOfflineCache = useCallback(() => {
    try {
      localStorage.removeItem(storageKeyBackup);
      localStorage.removeItem(storageKeyQueue);
      setPendingCount(0);
    } catch (err) {
      console.warn('Failed to clean up exam local storage:', err);
    }
  }, [storageKeyBackup, storageKeyQueue]);

  // Network online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Automatically attempt to flush queued answers when connection recovers
      flushQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pending count sync
    const initialQueue = getStoredQueue();
    setPendingCount(initialQueue.length);

    // Periodic sync attempt if online and items exist
    const interval = setInterval(() => {
      if (navigator.onLine && getStoredQueue().length > 0) {
        flushQueue();
      }
    }, 12000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [flushQueue, getStoredQueue]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncedAt,
    saveAnswer,
    flushQueue,
    getStoredAnswers,
    clearOfflineCache,
  };
}
