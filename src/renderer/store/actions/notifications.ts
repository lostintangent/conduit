import { Notification } from "@/types";
import { generateId } from "@/utils/id";
import { getDefaultStore } from "jotai";
import { notificationsAtom } from "../atoms";

const store = getDefaultStore();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAutoDismiss(id: string, timeout: number) {
  clearAutoDismiss(id);

  timers.set(
    id,
    setTimeout(() => dismissNotification(id), timeout)
  );
}

function clearAutoDismiss(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function enqueueNotification(
  options: Omit<Notification, "id" | "createdAt"> & {
    autoCloseMs?: number;
  }
) {
  const id = generateId();
  const notification: Notification = {
    ...options,
    id,
    createdAt: Date.now(),
  };

  store.set(notificationsAtom, (current) => [notification, ...current]);

  if (options.autoCloseMs && options.autoCloseMs > 0) {
    scheduleAutoDismiss(id, options.autoCloseMs);
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
