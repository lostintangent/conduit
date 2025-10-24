import { useAtomValue } from "jotai";
import {
  dismissNotification,
  notificationsAtom,
  type Notification,
} from "@/store/notifications";

function notificationStyles(kind: Notification["kind"]) {
  switch (kind) {
    case "success":
      return "border-l-4 border-l-emerald-400 bg-emerald-500/20 text-emerald-50";
    case "error":
      return "border-l-4 border-l-red-500 bg-red-500/15 text-red-100";
    default:
      return "border-l-4 border-l-sky-400 bg-surface-elevated bg-opacity-90 text-white";
  }
}

export function NotificationCenter() {
  const notifications = useAtomValue(notificationsAtom);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[2000] flex w-80 max-w-[92vw] flex-col gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`pointer-events-auto overflow-hidden rounded-lg border border-white/10 px-3 py-2 shadow-lg backdrop-blur ${notificationStyles(
            notification.kind
          )}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium leading-snug">
                {notification.message}
              </p>
              {notification.details ? (
                <p className="mt-1 text-xs leading-snug text-white/80">
                  {notification.details}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissNotification(notification.id)}
              className="rounded-md px-1 text-xs uppercase tracking-wide text-white/70 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
