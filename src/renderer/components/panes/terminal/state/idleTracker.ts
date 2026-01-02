// ============================================================================
// Terminal Idle Tracker
//
// Tracks idle state for terminal sessions based on output activity.
// A session is "idle" after IDLE_THRESHOLD_MS of no output.
//
// This module is intentionally decoupled from xterm/pane management.
// It only deals with session IDs and receives notifications about:
// - Session tracking (trackSession / untrackSession)
// - Data received (notifyDataReceived)
//
// Callbacks:
// - `idleSubscribers` - Global subscribers notified when any session becomes idle.
//   Used for UI notifications (tab indicators). Respects pause/skip state.
// - `pendingWaitRequests` - Per-session promise resolvers from waitForIdle() calls.
//   Used by CLI wait command. Always fires, ignores pause/skip state.
//
// State machine fields (per session):
// - `isIdle` - Whether the session is currently idle (no recent output)
// - `notificationsPaused` - When true, idleSubscribers are not notified
// - `skipNextNotification` - One-shot flag to skip the next idle notification.
//   Used to handle focus-lost race conditions during tab switches.
// - `idleTimer` - The pending timer that will fire the idle transition
// - `pendingWaitRequests` - Callbacks to resolve pending waitForIdle() promises
//
// Tab switch flow:
// 1. On tab switch: pause() sets notificationsPaused=true, skipNextNotification=true
// 2. Focus-lost may trigger shell output, but skip flag prevents notification
// 3. After grace period: resume() sets notificationsPaused=false
// 4. Real user activity clears skipNextNotification, so next idle fires normally
// ============================================================================

const IDLE_THRESHOLD_MS = 2000;

type IdleState = {
  isIdle: boolean;
  notificationsPaused: boolean;
  skipNextNotification: boolean;
  idleTimer: NodeJS.Timeout | null;
  pendingWaitRequests: Set<() => void>;
};

const sessionIdleState = new Map<string, IdleState>();
const idleSubscribers = new Set<(sessionId: string) => void>();

/**
 * Start tracking idle state for a terminal session.
 * Called when the first pane is created for a session.
 */
export function trackSession(sessionId: string): void {
  sessionIdleState.set(sessionId, {
    isIdle: true,
    notificationsPaused: false,
    // Skip the first notification to avoid spurious alerts during shell init
    skipNextNotification: true,
    idleTimer: null,
    pendingWaitRequests: new Set(),
  });
}

/**
 * Stop tracking idle state for a terminal session.
 * Called when the last pane for a session is disposed.
 * Resolves any pending wait requests before cleanup.
 */
export function untrackSession(sessionId: string): void {
  const state = sessionIdleState.get(sessionId);
  if (!state) return;

  if (state.idleTimer) clearTimeout(state.idleTimer);

  // Resolve any pending wait requests before removing the session
  state.pendingWaitRequests.forEach((resolve) => resolve());

  sessionIdleState.delete(sessionId);
}

/**
 * Notify the tracker that data was received for a session.
 * Resets the idle timer and updates state accordingly.
 */
export function notifyDataReceived(sessionId: string): void {
  const state = sessionIdleState.get(sessionId);
  if (!state) return;

  // Clear existing timer
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.isIdle = false;

  // If notifications aren't paused, this is real user activity.
  // Clear the skip flag so the next idle transition fires normally.
  if (!state.notificationsPaused) {
    state.skipNextNotification = false;
  }

  // Start new idle timer
  state.idleTimer = setTimeout(() => {
    state.isIdle = true;

    // Always resolve pending waitForIdle() promises (used by CLI)
    state.pendingWaitRequests.forEach((resolve) => resolve());

    // Only notify listeners when not paused and not skipping
    if (!state.notificationsPaused && !state.skipNextNotification) {
      idleSubscribers.forEach((cb) => cb(sessionId));
    }

    // Clear skip flag after firing (or skipping)
    state.skipNextNotification = false;
  }, IDLE_THRESHOLD_MS);
}

/**
 * Subscribe to idle events for any terminal session.
 * Respects pause/suppress state - use for UI notifications.
 */
export function onSessionIdle(
  callback: (sessionId: string) => void,
): () => void {
  idleSubscribers.add(callback);
  return () => idleSubscribers.delete(callback);
}

/**
 * Pause idle notifications for a session.
 * Used during tab switches to ignore focus-lost events.
 */
export function pauseIdleTracking(sessionId: string): void {
  const state = sessionIdleState.get(sessionId);
  if (state) {
    state.notificationsPaused = true;
    state.skipNextNotification = true;
  }
}

/**
 * Resume idle notifications for a session.
 * Call after the grace period following a tab switch.
 */
export function resumeIdleTracking(sessionId: string): void {
  const state = sessionIdleState.get(sessionId);
  if (state) state.notificationsPaused = false;
}

/**
 * Wait for a terminal session to become idle.
 * Resolves to true when idle, false if timeout is reached.
 * Not affected by pause state - always works regardless of UI pause.
 *
 * @param sessionId The session ID to wait for (must be a session ID, not pane ID)
 * @param timeout Optional timeout in milliseconds
 */
export function waitForIdle(
  sessionId: string,
  timeout?: number,
): Promise<boolean> {
  const state = sessionIdleState.get(sessionId);
  if (!state || state.isIdle) return Promise.resolve(true);

  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | undefined;

    const onIdle = () => {
      state.pendingWaitRequests.delete(onIdle);
      if (timeoutId) clearTimeout(timeoutId);
      resolve(true);
    };

    if (timeout) {
      timeoutId = setTimeout(() => {
        state.pendingWaitRequests.delete(onIdle);
        resolve(false);
      }, timeout);
    }

    state.pendingWaitRequests.add(onIdle);
  });
}
