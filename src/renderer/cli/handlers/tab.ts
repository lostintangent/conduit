import type { HandlerSubset } from "./types";
import { openTab } from "@/store/actions/tab";

export const tabHandlers: HandlerSubset = {
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
};
