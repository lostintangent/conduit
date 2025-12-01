import type { HandlerMap } from "./types";

export const paneHandlers: Partial<HandlerMap> = {
  "pane-list": (args, context) => {
    const matchingTab = context.findCallingTerminalTab();

    if (!matchingTab) {
      context.respondError("Unable to find the calling terminal's tab.");
      return;
    }

    const panes = Object.values(matchingTab.panes)
      .filter(
        (pane) =>
          !(pane.type === "terminal" && pane.sessionId === context.sessionId),
      )
      .filter((pane) => {
        if (args?.paneType === "all") {
          return true;
        }

        if (args?.paneType === "browser") {
          return pane.type === "webview";
        }

        return pane.type === args?.paneType;
      })
      .map((pane) => ({ ...pane }));

    context.respondResult(panes);
  },

  "pane-move": async (args, context) => {
    const targetCommand = context.moveCommandMap[args.direction];
    await targetCommand.execute();

    context.respondResult();
  },

  "pane-split": async (args, context) => {
    const targetCommand =
      context.splitCommandMap[args.paneType][args.direction];
    await targetCommand.execute();

    context.respondResult();
  },

  "pane-focus": async (_args, context) => {
    await context.focusPaneCommand.execute();
    context.respondResult();
  },

  "pane-close": async (args, context) => {
    const targetCommand = args.closeTab
      ? context.closeTabCommand
      : context.closePaneCommand;
    await targetCommand.execute();

    context.respondResult();
  },
};
