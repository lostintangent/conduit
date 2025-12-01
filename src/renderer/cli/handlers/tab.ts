import type { HandlerMap } from "./types";
import { openTab, updateTabProperty } from "@/store/actions/tab";

export const tabHandlers: Partial<HandlerMap> = {
  "tab-new": async (args) => {
    await openTab({
      title: args?.title,
      command: args?.command,
    });
  },

  "tab-duplicate": async (_args, context) => {
    await context.duplicateTabCommand.execute();
  },

  "tab-lock": (_args, context) => {
    const tab = context.findCallingTerminalTab();
    updateTabProperty(tab.id, { locked: !tab.locked });
  },

  "tab-synchronize": (_args, context) => {
    const tab = context.findCallingTerminalTab();
    updateTabProperty(tab.id, { synchronized: !tab.synchronized });
  },
};
