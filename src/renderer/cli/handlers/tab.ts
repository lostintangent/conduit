import type { HandlerMap } from "./types";
import {
  openTab,
  lockTab,
  unlockTab,
  updateTabProperty,
} from "@/store/actions/tab";

export const tabHandlers: Partial<HandlerMap> = {
  "tab-new": async (args, context) => {
    await openTab({
      title: args?.title,
      command: args?.command,
    });
    context.respondResult();
  },

  "tab-duplicate": async (_args, context) => {
    await context.duplicateTabCommand.execute();
    context.respondResult();
  },

  "tab-lock": (_args, context) => {
    const tab = context.findCallingTerminalTab();
    if (!tab) {
      context.respondError("Unable to find the calling tab.");
      return;
    }

    if (tab.locked) {
      unlockTab(tab.id);
    } else {
      lockTab(tab.id);
    }
    context.respondResult();
  },

  "tab-synchronize": (_args, context) => {
    const tab = context.findCallingTerminalTab();
    if (!tab) {
      context.respondError("Unable to find the calling tab.");
      return;
    }

    updateTabProperty(tab.id, { synchronized: !tab.synchronized });
    context.respondResult();
  },
};
