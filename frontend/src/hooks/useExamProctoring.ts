import { useState, useEffect, useCallback, useRef } from 'react';
import { attemptsApi } from '../api/attempts';

interface UseExamProctoringOptions {
  attemptId?: number;
  initialWarningCount?: number;
  isActive: boolean;
  hasStarted?: boolean;
  maxWarnings?: number;
  onMaxWarningsReached?: () => void;
}

export interface ProctoringWarningState {
  warningNumber: number;
  eventType: string;
  details: string;
  timestamp: string;
}

export const useExamProctoring = ({
  attemptId,
  initialWarningCount = 0,
  isActive,
  hasStarted = true,
  maxWarnings = 5,
  onMaxWarningsReached,
}: UseExamProctoringOptions) => {
  const [warningCount, setWarningCount] = useState(initialWarningCount);
  const [activeWarning, setActiveWarning] = useState<ProctoringWarningState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const isHandlingViolation = useRef(false);

  // Sync with initialWarningCount when attempt data loads
  useEffect(() => {
    if (initialWarningCount !== undefined && initialWarningCount > warningCount) {
      setWarningCount(initialWarningCount);
      if (initialWarningCount >= maxWarnings && onMaxWarningsReached) {
        onMaxWarningsReached();
      }
    }
  }, [initialWarningCount, maxWarnings, onMaxWarningsReached]);

  // Maintain real-time fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Request fullscreen
  const requestFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('Fullscreen request bypassed or denied:', err);
    }
  }, []);

  const triggerWarning = useCallback(
    async (eventType: string, details: string) => {
      if (!isActive || !hasStarted || !attemptId || isHandlingViolation.current) return;

      isHandlingViolation.current = true;
      const nextCount = warningCount + 1;
      setWarningCount(nextCount);

      const warningObj: ProctoringWarningState = {
        warningNumber: nextCount,
        eventType,
        details,
        timestamp: new Date().toLocaleTimeString(),
      };

      setActiveWarning(warningObj);

      try {
        const res: any = await attemptsApi.logProctoringWarning(attemptId, eventType, details);
        const serverCount = res?.data?.warning_count ?? res?.warning_count;
        if (typeof serverCount === 'number' && serverCount > nextCount) {
          setWarningCount(serverCount);
        }
        if ((nextCount >= maxWarnings || (typeof serverCount === 'number' && serverCount >= maxWarnings) || res?.auto_submitted) && onMaxWarningsReached) {
          onMaxWarningsReached();
        }
      } catch (err) {
        console.error('Failed to report proctoring warning to server:', err);
      }

      if (nextCount >= maxWarnings && onMaxWarningsReached) {
        onMaxWarningsReached();
      }

      // Cool-off debounce to avoid multiple rapid alerts on single alt-tab
      setTimeout(() => {
        isHandlingViolation.current = false;
      }, 1500);
    },
    [isActive, hasStarted, attemptId, warningCount, maxWarnings, onMaxWarningsReached]
  );

  const dismissWarning = useCallback(() => {
    setActiveWarning(null);
    // Automatically re-request fullscreen if lost
    if (!document.fullscreenElement) {
      requestFullscreen();
    }
  }, [requestFullscreen]);

  useEffect(() => {
    if (!isActive || !attemptId) return;

    // 1. Tab visibility change (switching tabs or minimizing window)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerWarning(
          'TAB_SWITCH',
          'Student navigated away from active exam tab or minimized window.'
        );
      }
    };

    // 2. Window blur (clicking outside the window, floating app, devtools)
    const handleWindowBlur = () => {
      triggerWarning(
        'WINDOW_BLUR',
        'Window lost active focus (external application, floating window, or notification accessed).'
      );
    };

    // 3. Fullscreen state change
    const handleFullscreenChange = () => {
      const isNowFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isNowFs);
      if (!isNowFs) {
        triggerWarning(
          'FULLSCREEN_EXIT',
          'Student exited secure full-screen assessment view.'
        );
      }
    };

    // 4. Keyboard shortcuts blocking (F12, Ctrl+C, Ctrl+V, Alt+Tab, Ctrl+Shift+I, etc.)
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 or inspect shortcuts
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault();
        triggerWarning('DEVTOOLS_ATTEMPT', 'Developer tools or source inspection shortcut detected.');
        return;
      }

      // Copy / Paste / Print shortcuts
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        triggerWarning('CLIPBOARD_ACTION', `Clipboard shortcut Ctrl+${e.key.toUpperCase()} blocked.`);
        return;
      }
    };

    // 5. Right-click context menu prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // 6. Copy / Cut / Paste event prevention
    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerWarning('CLIPBOARD_ACTION', 'Direct copy/paste action blocked.');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopyPaste);
    window.addEventListener('paste', handleCopyPaste);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopyPaste);
      window.removeEventListener('paste', handleCopyPaste);
    };
  }, [isActive, attemptId, triggerWarning]);

  return {
    warningCount,
    activeWarning,
    dismissWarning,
    isFullscreen,
    requestFullscreen,
  };
};
