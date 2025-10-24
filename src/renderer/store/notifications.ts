import { atom } from "jotai";
import { getDefaultStore } from "jotai";

export type NotificationKind = "info" | "success" | "error";

export type Notification = {
  id: string;
  kind: NotificationKind;
  message: string;
  details?: string;
  persistent?: boolean;
  createdAt: number;
};

const store = getDefaultStore();

export const notificationsAtom = atom<Notification[]>([]);

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAutoDismiss(id: string, timeout: number) {
  clearAutoDismiss(id);
  timers.set(
    id,
    setTimeout(() => {
      dismissNotification(id);
    }, timeout)
  );
}

function clearAutoDismiss(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2, 10);
}

export function enqueueNotification(
  notification: {
    kind: NotificationKind;
    message: string;
    details?: string;
    persistent?: boolean;
    autoCloseMs?: number;
  }
): string {
  const id = createId();
  const entry: Notification = {
    id,
    kind: notification.kind,
    message: notification.message,
    details: notification.details,
    persistent: notification.persistent,
    createdAt: Date.now(),
  };

  store.set(notificationsAtom, (current) => [entry, ...current]);

  if (notification.autoCloseMs && notification.autoCloseMs > 0) {
    scheduleAutoDismiss(id, notification.autoCloseMs);
  }

  return id;
}

export function updateNotification(
  id: string,
  updates: Partial<Omit<Notification, "id" | "createdAt">> & {
    autoCloseMs?: number | null;
  }
) {
  store.set(notificationsAtom, (current) =>
    current.map((notification) =>
      notification.id === id
        ? {
            ...notification,
            ...updates,
          }
        : notification
    )
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
    current.filter((notification) => notification.id !== id)
  );
}

export function clearNotifications() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  store.set(notificationsAtom, []);
}
