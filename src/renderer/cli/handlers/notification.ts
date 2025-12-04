import type { HandlerMap } from "./types";
import {
  dismissNotification,
  enqueueNotification,
} from "@/store/actions/notifications";
import { activatePane } from "@/store/actions/pane";
import { focusTab } from "@/store/actions/tab";

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

    const isAlreadyActive =
      matchingTab.id === context.activeTab?.id &&
      callingPane[0] === context.activeTab?.activePaneId;

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
  },
};
