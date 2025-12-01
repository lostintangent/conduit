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

    if (!matchingTab) {
      context.respondError("Unable to find the calling terminal's tab.");
      return;
    }

    const callingPane = Object.entries(matchingTab.panes).find(
      ([, pane]) =>
        pane.type === "terminal" && pane.sessionId === context.sessionId,
    );

    if (!callingPane) {
      context.respondError("Unable to find the calling terminal's pane.");
      return;
    }

    const isAlreadyActive =
      matchingTab.id === context.activeTab?.id &&
      callingPane[0] === context.activeTab?.activePaneId;

    const notificationId = enqueueNotification({
      kind: "info",
      message: args.message,
      persistent: args.persistent ?? false,
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

    context.respondResult();
  },
};
