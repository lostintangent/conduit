import type { HandlerMap } from "./types";
import { executeCommand } from "@/commands";
import { openTab, updateTabProperty } from "@/store/actions/tab";
import { ApplicationCommands } from "@shared/commands";

export const tabHandlers: Partial<HandlerMap> = {
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
};
