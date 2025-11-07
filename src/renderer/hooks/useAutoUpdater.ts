import { enqueueNotification } from "@/store/actions/notifications";
import { useEffect } from "react";

const api = window.conduit;

export function useAutoUpdater() {
  useEffect(() => {
    const unsubscribe = api.onUpdateEvent((state) => {
      // When an update is available and downloaded, then
      // notify the user to see if they want to install it.
      if (state.status === "downloaded") {
        enqueueNotification({
          kind: "success",
          message: "Update available!",
          persistent: true,
          actions: [
            {
              label: "Install and Restart",
              onClick: () => {
                // Show a loading notification while waiting
                // for the app to restart after installing the update.
                enqueueNotification({
                  kind: "info",
                  message: "Installing update and restarting...",
                  persistent: true,
                });

                api.installUpdate();
              },
            },
          ],
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
