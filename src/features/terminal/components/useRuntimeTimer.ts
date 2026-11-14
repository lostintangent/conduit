import { useEffect, useState } from "react";
import {
  getRuntimeTimestamps,
  getSessionState,
  onRuntimeReset,
  onSessionStateChange,
} from "../client/stateTracker";

/**
 * Format elapsed milliseconds as human-readable duration.
 * Examples: "30s", "1m 23s", "1h 23m 45s"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

interface UseRuntimeTimerOptions {
  sessionId: string;
  enabled: boolean;
}

interface RuntimeTimerResult {
  /** Formatted duration string (e.g., "30s", "1m 23s") or null if no runtime */
  display: string | null;
  /** Whether the timer is currently counting (terminal is running) */
  isRunning: boolean;
}

/**
 * Hook to track and display how long a terminal has been running.
 *
 * Performance characteristics:
 * - Timer interval only runs when enabled AND terminal is in "running" state
 * - When disabled or unmounted (background tabs), all timers and subscriptions clean up
 * - When idle with runtime data, shows static final time with no active timers
 */
export function useRuntimeTimer({
  sessionId,
  enabled,
}: UseRuntimeTimerOptions): RuntimeTimerResult {
  const [display, setDisplay] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDisplay(null);
      setIsRunning(false);
      return;
    }

    // Compute display from timestamps - uses idleSince if idle, Date.now() if running
    const computeDisplay = (): string | null => {
      const { runningStartedAt, idleSince } = getRuntimeTimestamps(sessionId);
      if (!runningStartedAt) return null;

      const endTime = idleSince ?? Date.now();
      return formatDuration(endTime - runningStartedAt);
    };

    // Initialize from current state
    const initialState = getSessionState(sessionId);
    setIsRunning(initialState === "running");
    setDisplay(computeDisplay());

    // Timer management - only ticks when running
    let intervalId: NodeJS.Timeout | null = null;

    const startTimer = () => {
      if (!intervalId) {
        intervalId = setInterval(() => setDisplay(computeDisplay()), 1000);
      }
    };

    const stopTimer = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    if (initialState === "running") {
      startTimer();
    }

    // Subscribe to state transitions
    const unsubscribeState = onSessionStateChange((id, state) => {
      if (id !== sessionId) return;

      setIsRunning(state === "running");
      setDisplay(computeDisplay());

      if (state === "running") {
        startTimer();
      } else {
        stopTimer();
      }
    });

    // Subscribe to runtime resets (user input while idle clears timestamps)
    const unsubscribeReset = onRuntimeReset((id) => {
      if (id !== sessionId) return;
      setDisplay(null);
    });

    return () => {
      stopTimer();
      unsubscribeState();
      unsubscribeReset();
    };
  }, [sessionId, enabled]);

  return { display, isRunning };
}
