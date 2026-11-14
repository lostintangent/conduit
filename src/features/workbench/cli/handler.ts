import type { HandlerMap } from "@/cli/handlers/types";
import { executeCommand } from "@/commands";
import {
  dismissNotification,
  enqueueNotification,
} from "@features/workbench/client/actions/notifications";
import {
  activatePane,
  closePane,
} from "@features/workbench/client/actions/pane";
import {
  focusTab,
  markTabAsNotified,
  openTab,
  updateTabProperty,
} from "@features/workbench/client/actions/tab";
import { ApplicationCommands } from "@shared/commands";

const moveCommands = {
  left: ApplicationCommands.PANE_MOVE_LEFT,
  right: ApplicationCommands.PANE_MOVE_RIGHT,
  up: ApplicationCommands.PANE_MOVE_UP,
  down: ApplicationCommands.PANE_MOVE_DOWN,
  tab: ApplicationCommands.PANE_MOVE_TO_TAB,
} as const;

const splitCommands = {
  terminal: {
    left: ApplicationCommands.PANE_SPLIT_LEFT,
    right: ApplicationCommands.PANE_SPLIT_RIGHT,
    top: ApplicationCommands.PANE_SPLIT_TOP,
    bottom: ApplicationCommands.PANE_SPLIT_BOTTOM,
  },
  browser: {
    left: ApplicationCommands.PANE_SPLIT_LEFT_BROWSER,
    right: ApplicationCommands.PANE_SPLIT_RIGHT_BROWSER,
    top: ApplicationCommands.PANE_SPLIT_TOP_BROWSER,
    bottom: ApplicationCommands.PANE_SPLIT_BOTTOM_BROWSER,
  },
  editor: {
    left: ApplicationCommands.PANE_SPLIT_LEFT_EDITOR,
    right: ApplicationCommands.PANE_SPLIT_RIGHT_EDITOR,
    top: ApplicationCommands.PANE_SPLIT_TOP_EDITOR,
    bottom: ApplicationCommands.PANE_SPLIT_BOTTOM_EDITOR,
  },
  canvas: {
    left: ApplicationCommands.PANE_SPLIT_LEFT_CANVAS,
    right: ApplicationCommands.PANE_SPLIT_RIGHT_CANVAS,
    top: ApplicationCommands.PANE_SPLIT_TOP_CANVAS,
    bottom: ApplicationCommands.PANE_SPLIT_BOTTOM_CANVAS,
  },
} as const;

export default {
  "pane-list": (args, context) => {
    const matchingTab = context.findCallingTerminalTab();

    const panes = Object.values(matchingTab.panes)
      .filter(
        (pane) =>
          !(pane.type === "terminal" && pane.sessionId === context.sessionId),
      )
      .filter((pane) => {
        if (args?.paneType === "all") {
          return true;
        }

        return pane.type === args?.paneType;
      })
      .map((pane) => ({ ...pane }));

    return panes;
  },

  "pane-move": async (args) => {
    await executeCommand(moveCommands[args.direction]);
  },

  "pane-split": async (args) => {
    await executeCommand(splitCommands[args.paneType][args.direction]);
  },

  "pane-focus": async () => {
    await executeCommand(ApplicationCommands.PANE_FOCUS);
  },

  "pane-close": async (args, context) => {
    if (args.closeTab) {
      await executeCommand(ApplicationCommands.TAB_CLOSE);
    } else if (args.paneId) {
      // Close the specified pane
      const callingTab = context.findCallingTerminalTab();
      if (!callingTab.panes[args.paneId]) {
        throw new Error(`Pane "${args.paneId}" not found in the current tab`);
      }
      closePane(callingTab.id, args.paneId);
    } else {
      // Close the calling pane (default behavior)
      await executeCommand(ApplicationCommands.PANE_CLOSE);
    }
  },

  "tab-new": async (args) => {
    await openTab({
      title: args?.title,
      command: args?.command,
    });
  },

  "tab-duplicate": async () => {
    await executeCommand(ApplicationCommands.TAB_DUPLICATE);
  },

  "tab-lock": (_args, context) => {
    const tab = context.findCallingTerminalTab();
    updateTabProperty(tab.id, { locked: !tab.locked });
  },

  "tab-synchronize": (_args, context) => {
    const tab = context.findCallingTerminalTab();
    updateTabProperty(tab.id, { synchronized: !tab.synchronized });
  },

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
} satisfies Partial<HandlerMap>;
