import type { HandlerMap } from "./types";
import {
  dismissNotification,
  enqueueNotification,
} from "@/store/actions/notifications";
import { activatePane } from "@/store/actions/pane";
import { focusTab, markTabAsNotified } from "@/store/actions/tab";

export const notificationHandlers: Partial<HandlerMap> = {
  notify: (args, context) => {
    const matchingTab = context.findCallingTerminalTab();

    const callingPane = Object.entries(matchingTab.panes).find(
      ([, pane]) =>
        pane.type === "terminal" && pane.sessionId === context.sessionId,
    );

    if (!callingPane) {
      throw new Error("Unable to find the calling terminal's pane.");
    }

    const isTabActive = matchingTab.id === context.activeTab?.id;

    // Always mark background tabs as notified
    if (!isTabActive) {
      markTabAsNotified(matchingTab.id, context.sessionId);
    }

    // Only show notification toast if message provided
    if (args.message) {
      const isPaneActive = callingPane[0] === context.activeTab?.activePaneId;
      const isAlreadyActive = isTabActive && isPaneActive;

      const notificationId = enqueueNotification({
        kind: "info",
        message: args.message,
        system: true,
        actions: !isAlreadyActive
          ? [
              {
                label: "Focus terminal",
                onClick: () => {
                  focusTab(matchingTab.id);
                  activatePane(matchingTab.id, callingPane[0]);
                  dismissNotification(notificationId);
                },
              },
            ]
          : undefined,
      });
    }
  },
};
