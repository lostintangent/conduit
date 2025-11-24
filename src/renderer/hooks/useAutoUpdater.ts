import {
  dismissNotification,
  enqueueNotification,
} from "@/store/actions/notifications";
import { useEffect, useRef } from "react";

const { updates } = window.conduit;

export function useAutoUpdater() {
  const currentNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = updates.onStatusChanged(({ status, releaseName }) => {
      if (status !== "downloaded") return;

      // Dismiss the previous notification if it exists
      if (currentNotificationIdRef.current) {
        dismissNotification(currentNotificationIdRef.current);
      }

      // When an update is available and downloaded, then
      // notify the user to see if they want to install it.
      const availableNotification = enqueueNotification({
        kind: "success",
        message: `Update available (${releaseName})`,
        persistent: true,
        actions: [
          {
            label: "Install and Restart",
            onClick: () => {
              dismissNotification(availableNotification);

              // Show a loading notification while waiting
              // for the app to restart after installing the update.
              enqueueNotification({
                kind: "info",
                message: "Installing update and restarting...",
                persistent: true,
              });

              updates.installAndRestart();
            },
          },
        ],
      });

      // Store the notification ID so we can dismiss it if another update arrives
      currentNotificationIdRef.current = availableNotification;
    });

    return () => {
      unsubscribe();
      currentNotificationIdRef.current = null;
    };
  }, []);
}
