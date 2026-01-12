import { dismissNotification } from "@/store/actions/notifications";
import { notificationsAtom } from "@/store/atoms";
import { Notification } from "@/types";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useAtomValue } from "jotai";

function notificationStyles(kind: Notification["kind"]) {
  switch (kind) {
    case "success":
      return "border-l-4 border-l-emerald-400 bg-emerald-500/20 text-emerald-50";
    case "error":
      return "border-l-4 border-l-red-500 bg-red-500/15 text-red-100";
    default:
      return "border-l-4 border-l-sky-400 bg-popover bg-opacity-90 text-white";
  }
}

export function NotificationCenter() {
  const notifications = useAtomValue(notificationsAtom);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-80 max-w-[92vw] flex-col gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`pointer-events-auto overflow-hidden rounded-lg border border-white/10 px-3 py-2 shadow-lg backdrop-blur ${notificationStyles(
            notification.kind,
          )}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium leading-snug">
                {notification.message}
              </p>

              {notification.details && (
                <p className="mt-1 text-xs leading-snug text-white/80">
                  {notification.details}
                </p>
              )}

              {notification.actions?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {notification.actions.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      onClick={action.onClick}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => dismissNotification(notification.id)}
              aria-label="Close notification"
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
