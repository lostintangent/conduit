// ============================================================================
// Terminal State Tracker
//
// Tracks running/idle state for terminal sessions based on output activity.
// Requires sustained activity (3s) to transition idle→running, and sustained
// inactivity (2s) to transition running→idle.
//
// State machine:
// - "idle"    → No activity (or activity not yet sustained)
// - "running" → Sustained activity confirmed
// ============================================================================

type SessionState = "idle" | "running";

type TrackedSession = {
  state: SessionState;
  notificationsPaused: boolean;
  pendingWaitRequests: Set<() => void>;

  // Suppress activity that occurs directly after user input
  // under the assumption it's echo or related output.
  inputSuppressionUntil: number | null;

  // running -> idle transition
  runningToIdleTimer: NodeJS.Timeout | null;

  // idle -> running transition (sustained activity detection)
  idleToRunningTimer: NodeJS.Timeout | null;
  sawActivitySinceLastCheck: boolean;
  consecutiveActivitySeconds: number;

  // Runtime tracking timestamps
  runningStartedAt: number | null; // When terminal transitioned to running
  idleSince: number | null; // When terminal transitioned to idle
};

const sessionStateMap = new Map<string, TrackedSession>();
const stateChangeSubscribers = new Set<
  (sessionId: string, state: SessionState) => void
>();
const runtimeResetSubscribers = new Set<(sessionId: string) => void>();

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current state of a session.
 * Returns "idle" if the session is not tracked.
 */
export function getSessionState(sessionId: string): SessionState {
  return sessionStateMap.get(sessionId)?.state ?? "idle";
}

/**
 * Runtime timestamps for a terminal session.
 */
export type RuntimeTimestamps = {
  runningStartedAt: number | null;
  idleSince: number | null;
};

/**
 * Get the runtime timestamps for a session.
 * Returns null values if the session is not tracked.
 */
export function getRuntimeTimestamps(sessionId: string): RuntimeTimestamps {
  const session = sessionStateMap.get(sessionId);
  return {
    runningStartedAt: session?.runningStartedAt ?? null,
    idleSince: session?.idleSince ?? null,
  };
}

/**
 * Start tracking state for a terminal session.
 * Called when a new terminal session is created.
 * Initializes the session in the "idle" state.
 */
export function trackSession(sessionId: string): void {
  sessionStateMap.set(sessionId, {
    state: "idle",
    notificationsPaused: false,
    pendingWaitRequests: new Set(),
    inputSuppressionUntil: null,
    runningToIdleTimer: null,
    idleToRunningTimer: null,
    sawActivitySinceLastCheck: false,
    consecutiveActivitySeconds: 0,
    runningStartedAt: null,
    idleSince: null,
  });
}

/**
 * Stop tracking state for a terminal session.
 * Called when a terminal session is closed.
 * Clears all timers and resolves any pending wait requests.
 */
export function untrackSession(sessionId: string): void {
  const session = sessionStateMap.get(sessionId);
  if (!session) return;

  if (session.runningToIdleTimer) clearTimeout(session.runningToIdleTimer);
  if (session.idleToRunningTimer) clearTimeout(session.idleToRunningTimer);

  session.pendingWaitRequests.forEach((resolve) => resolve());
  sessionStateMap.delete(sessionId);
}

/**
 * Notify the tracker that data was received for a session.
 * This is the main entry point for terminal output events.
 *
 * When idle: marks activity and starts checking for sustained activity.
 * When running: resets the inactivity timer.
 */
export function notifyDataReceived(sessionId: string): void {
  const session = sessionStateMap.get(sessionId);
  if (!session) return;

  if (session.state === "idle") {
    // Only suppress echo-driven activity when idle - we don't want
    // user input to accidentally trigger an idle→running transition.
    // When running, we still want output to reset the idle timer.
    if (
      session.inputSuppressionUntil !== null &&
      Date.now() < session.inputSuppressionUntil
    ) {
      return;
    }

    session.sawActivitySinceLastCheck = true;

    if (!session.idleToRunningTimer) {
      // First event - start checking for sustained activity
      session.consecutiveActivitySeconds = 0;
      session.idleToRunningTimer = setTimeout(
        () => checkForSustainedActivity(session, sessionId),
        ACTIVITY_CHECK_INTERVAL_MS,
      );
    }
  } else {
    // running - reset the inactivity timer
    if (session.runningToIdleTimer) {
      clearTimeout(session.runningToIdleTimer);
    }
    startIdleTimer(session, sessionId);
  }
}

// How long to suppress output-driven activity after input is sent to the PTY.
// This filters out echo and prompt redraws from being treated as command output.
const INPUT_ECHO_SUPPRESSION_MS = 500;

/**
 * Signal that input was just sent to the PTY.
 *
 * This temporarily suppresses output-driven activity detection, since the
 * immediate output is likely echo or prompt redraw rather than command output.
 *
 * If the session is idle, also clears the previous runtime since new input
 * represents the start of a new "session" for timing purposes.
 *
 * Called from two places:
 * - xtermCache.ts: when user types directly in a terminal
 * - synchronizeInput.ts: when input is broadcast to synchronized terminals
 */
export function notifyUserInput(sessionId: string): void {
  const session = sessionStateMap.get(sessionId);
  if (!session) return;

  session.inputSuppressionUntil = Date.now() + INPUT_ECHO_SUPPRESSION_MS;

  // Clear previous runtime when idle - new input starts a fresh timing session.
  if (session.state === "idle" && session.runningStartedAt !== null) {
    session.runningStartedAt = null;
    session.idleSince = null;
    // Notify runtime subscribers so timer UI can clear stale display
    runtimeResetSubscribers.forEach((cb) => cb(sessionId));
  }
}

/**
 * Subscribe to state change events for any terminal session.
 * Callback is invoked when a session transitions between idle and running.
 *
 * @param callback - The callback to trigger when a session's state changes.
 * @returns An unsubscribe function.
 */
export function onSessionStateChange(
  callback: (sessionId: string, state: SessionState) => void,
): () => void {
  stateChangeSubscribers.add(callback);
  return () => stateChangeSubscribers.delete(callback);
}

/**
 * Subscribe to runtime reset events for any terminal session.
 * Callback is invoked when runtime timestamps are cleared (e.g., user input while idle).
 *
 * @param callback - The callback to trigger when a session's runtime is reset.
 * @returns An unsubscribe function.
 */
export function onRuntimeReset(
  callback: (sessionId: string) => void,
): () => void {
  runtimeResetSubscribers.add(callback);
  return () => runtimeResetSubscribers.delete(callback);
}

/**
 * Immediately mark a session as idle.
 * Resolves pending wait requests but does not notify UI subscribers.
 *
 * This is used by the CLI `notify` command to signal task completion externally.
 * UI updates are handled separately via the tab state system, so broadcasting
 * to state change subscribers would be redundant.
 */
export function markAsIdle(sessionId: string): void {
  const session = sessionStateMap.get(sessionId);
  if (!session) return;

  if (session.runningToIdleTimer) {
    clearTimeout(session.runningToIdleTimer);
    session.runningToIdleTimer = null;
  }
  clearIdleToRunningCheck(session);

  transitionToIdle(session);
}

/**
 * Pause state notifications for a session.
 */
export function pauseStateTracking(sessionId: string): void {
  const session = sessionStateMap.get(sessionId);
  if (session) {
    session.notificationsPaused = true;
  }
}

/**
 * Resume state notifications for a session.
 */
export function resumeStateTracking(sessionId: string): void {
  const session = sessionStateMap.get(sessionId);
  if (session) {
    session.notificationsPaused = false;
  }
}

/**
 * Wait for a terminal session to become idle.
 * Resolves immediately if already idle, otherwise waits for the transition.
 * Returns true if idle was reached, false if timeout was hit.
 *
 * @param sessionId - The session to wait for
 * @param timeout - Optional timeout in milliseconds
 */
export function waitForIdle(
  sessionId: string,
  timeout?: number,
): Promise<boolean> {
  const session = sessionStateMap.get(sessionId);
  if (!session || session.state === "idle") return Promise.resolve(true);

  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | undefined;

    const onIdle = () => {
      session.pendingWaitRequests.delete(onIdle);
      if (timeoutId) clearTimeout(timeoutId);
      resolve(true);
    };

    if (timeout) {
      timeoutId = setTimeout(() => {
        session.pendingWaitRequests.delete(onIdle);
        resolve(false);
      }, timeout);
    }

    session.pendingWaitRequests.add(onIdle);
  });
}

// ============================================================================
// Internal helpers
// ============================================================================

// Idle -> Running

const ACTIVITY_CHECK_INTERVAL_MS = 1000;
const REQUIRED_CONSECUTIVE_SECONDS = 3;

/**
 * Check if activity has been sustained for enough consecutive seconds.
 * Called every 1s while in idle state.
 *
 * If activity was seen since last check:
 *   - Increment consecutive count
 *   - If threshold reached, transition to running
 *   - Otherwise, schedule another check
 *
 * If no activity was seen:
 *   - Clear the check and stay idle
 */
function checkForSustainedActivity(
  session: TrackedSession,
  sessionId: string,
): void {
  if (session.sawActivitySinceLastCheck) {
    session.consecutiveActivitySeconds++;
    session.sawActivitySinceLastCheck = false;

    if (session.consecutiveActivitySeconds >= REQUIRED_CONSECUTIVE_SECONDS) {
      // Sustained activity confirmed - transition to running
      clearIdleToRunningCheck(session);
      session.state = "running";
      session.runningStartedAt = Date.now();
      session.idleSince = null;
      if (!session.notificationsPaused) {
        stateChangeSubscribers.forEach((cb) => cb(sessionId, "running"));
      }
      startIdleTimer(session, sessionId);
    } else {
      // Keep checking
      session.idleToRunningTimer = setTimeout(
        () => checkForSustainedActivity(session, sessionId),
        ACTIVITY_CHECK_INTERVAL_MS,
      );
    }
  } else {
    // Activity stopped - stay idle
    clearIdleToRunningCheck(session);
  }
}

/**
 * Clear the idle→running activity check.
 * Cancels the timer and resets tracking state.
 */
function clearIdleToRunningCheck(session: TrackedSession): void {
  if (session.idleToRunningTimer) {
    clearTimeout(session.idleToRunningTimer);
    session.idleToRunningTimer = null;
  }
  session.sawActivitySinceLastCheck = false;
  session.consecutiveActivitySeconds = 0;
}

// Running -> Idle

const RUNNING_TO_IDLE_MS = 2000;

/**
 * Transition session to idle state and resolve all pending wait requests.
 * Captures the idle timestamp for runtime tracking.
 */
function transitionToIdle(session: TrackedSession): void {
  session.state = "idle";
  session.idleSince = Date.now();
  session.pendingWaitRequests.forEach((resolve) => resolve());
  session.pendingWaitRequests.clear();
}

/**
 * Start the running→idle timer.
 * After RUNNING_TO_IDLE_MS of inactivity, transitions to idle.
 */
function startIdleTimer(session: TrackedSession, sessionId: string): void {
  session.runningToIdleTimer = setTimeout(() => {
    transitionToIdle(session);
    if (!session.notificationsPaused) {
      stateChangeSubscribers.forEach((cb) => cb(sessionId, "idle"));
    }
  }, RUNNING_TO_IDLE_MS);
}
