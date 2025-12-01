import type { HandlerMap } from "./types";
import { openTab, updateTabProperty } from "@/store/actions/tab";

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
    if (!context.activeTab) {
      context.respondError("No active tab found.");
      return;
    }
    updateTabProperty(context.activeTab.id, {
      locked: !context.activeTab.locked,
    });
    context.respondResult();
  },

  "tab-synchronize": (_args, context) => {
    if (!context.activeTab) {
      context.respondError("No active tab found.");
      return;
    }
    updateTabProperty(context.activeTab.id, {
      synchronized: !context.activeTab.synchronized,
    });
    context.respondResult();
  },
};
