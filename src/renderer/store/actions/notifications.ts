import { Notification } from "@/types";
import { generateId } from "@shared/utils";
import { getDefaultStore } from "jotai";
import { notificationsAtom } from "../atoms";

const store = getDefaultStore();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAutoDismiss(id: string, timeout: number) {
  clearAutoDismiss(id);

  timers.set(
    id,
    setTimeout(() => dismissNotification(id), timeout),
  );
}

function clearAutoDismiss(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

/**
 * Checks if the application window is currently visible to the user.
 * Returns false if the document is hidden or the window doesn't have focus.
 */
function isAppVisible(): boolean {
  return !document.hidden && document.hasFocus();
}

/**
 * Shows a system-level notification using the browser's Notification API.
 */
function showSystemNotification(message: string, details?: string): void {
  const body = details ? `${message}\n${details}` : message;

  const createNotification = () => {
    new window.Notification("Conduit", { body });
  };

  if (window.Notification.permission === "granted") {
    createNotification();
  } else if (window.Notification.permission !== "denied") {
    window.Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        createNotification();
      }
    });
  }
}

const DEFAULT_AUTO_CLOSE_MS = 5000;

export function enqueueNotification(
  options: Omit<Notification, "id" | "createdAt"> & {
    autoCloseMs?: number | null;
    system?: boolean;
    persistent?: boolean;
  },
) {
  const { system, autoCloseMs, persistent, ...notificationOptions } = options;

  // Show system notification if requested and app is not visible
  if (system && !isAppVisible()) {
    showSystemNotification(
      notificationOptions.message,
      notificationOptions.details,
    );
  }

  const id = generateId();
  const notification: Notification = {
    ...notificationOptions,
    id,
    createdAt: Date.now(),
  };

  store.set(notificationsAtom, (current) => [notification, ...current]);

  // Schedule auto-dismiss: use explicit value, or default unless persistent/null
  const effectiveTimeout =
    autoCloseMs !== undefined
      ? autoCloseMs
      : persistent
        ? null
        : DEFAULT_AUTO_CLOSE_MS;

  if (effectiveTimeout && effectiveTimeout > 0) {
    scheduleAutoDismiss(id, effectiveTimeout);
  }

  return id;
}

export function updateNotification(
  id: string,
  updates: Partial<Omit<Notification, "id" | "createdAt">> & {
    autoCloseMs?: number | null;
  },
) {
  store.set(notificationsAtom, (current) =>
    current.map((notification) =>
      notification.id === id
        ? {
            ...notification,
            ...updates,
          }
        : notification,
    ),
  );

  if (typeof updates.autoCloseMs === "number") {
    if (updates.autoCloseMs > 0) {
      scheduleAutoDismiss(id, updates.autoCloseMs);
    } else {
      clearAutoDismiss(id);
    }
  } else if (updates.autoCloseMs === null) {
    clearAutoDismiss(id);
  }
}

export function dismissNotification(id: string) {
  clearAutoDismiss(id);

  store.set(notificationsAtom, (current) =>
    current.filter((notification) => notification.id !== id),
  );
}

export function clearNotifications() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();

  store.set(notificationsAtom, []);
}
