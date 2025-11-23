import {
  dismissNotification,
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { useEffect, useRef } from "react";

const { updates } = window.conduit;

export function useAutoUpdater() {
  const currentNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleInstallAndRestart = (notificationId: string | null) => {
      if (notificationId) {
        dismissNotification(notificationId);
      }

      currentNotificationIdRef.current = null;

      // Show a loading notification while waiting
      // for the app to restart after installing the update.
      enqueueNotification({
        kind: "info",
        message: "Installing update and restarting...",
        persistent: true,
      });

      updates.installAndRestart();
    };

    const unsubscribe = updates.onStatusChanged(({ status, releaseName }) => {
      if (status !== "downloaded") return;

      // Check if there's already a notification being displayed
      if (currentNotificationIdRef.current) {
        // Update the existing notification with the latest version info
        updateNotification(currentNotificationIdRef.current, {
          message: `Update available (${releaseName})`,
          actions: [
            {
              label: "Install and Restart",
              onClick: () => {
                handleInstallAndRestart(currentNotificationIdRef.current);
              },
            },
          ],
        });
      } else {
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
                handleInstallAndRestart(availableNotification);
              },
            },
          ],
        });

        // Store the notification ID so we can update it later
        currentNotificationIdRef.current = availableNotification;
      }
    });

    return () => {
      unsubscribe();
      currentNotificationIdRef.current = null;
    };
  }, []);
}
