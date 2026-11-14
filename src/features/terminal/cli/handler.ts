import { waitForIdle } from "@features/terminal/client/stateTracker";
import { serializeSession } from "@features/terminal/client/xtermCache";
import { isHyperTerminal } from "@features/workbench/client/actions/hyperTerminal";
import type { TerminalPane } from "@features/workbench/model";
import type { HandlerContext, HandlerMap } from "@/cli/handlers/types";

function resolveTerminalSessions(
  context: HandlerContext,
  paneId?: string,
  all?: boolean,
): string[] {
  const { sessionId } = context;
  const matchingTab = context.findCallingTerminalTab();

  const getOtherTerminalPanes = () =>
    Object.entries(matchingTab.panes).filter(
      ([, pane]) => pane.type === "terminal" && pane.sessionId !== sessionId,
    ) as [string, TerminalPane][];

  const callerIsHyperTerminal = isHyperTerminal(sessionId);

  if (all || (callerIsHyperTerminal && !paneId)) {
    const terminalPanes = getOtherTerminalPanes();

    if (terminalPanes.length === 0) {
      throw new Error("No other terminals found in the tab.");
    }

    return terminalPanes.map(([, pane]) => pane.sessionId);
  }

  if (paneId) {
    const pane = matchingTab.panes[paneId];
    if (!pane || pane.type !== "terminal") {
      throw new Error(`Terminal pane ${paneId} not found.`);
    }

    return [pane.sessionId];
  }

  const terminalPanes = getOtherTerminalPanes();

  if (terminalPanes.length === 0) {
    throw new Error("No other terminals found in the tab.");
  }

  return [terminalPanes[0][1].sessionId];
}

export default {
  "terminal-read": async (args, context) => {
    const targetSessionIds = resolveTerminalSessions(
      context,
      args?.paneId,
      args?.all,
    );

    if (targetSessionIds.length > 1) {
      const results: string[] = [];
      for (const targetSessionId of targetSessionIds) {
        const serialized = serializeSession(targetSessionId);
        if (serialized !== null) {
          results.push(serialized);
        }
      }

      if (results.length === 0) {
        throw new Error("Unable to read terminal buffers.");
      }

      return results.join("\n---\n");
    }

    const serialized = serializeSession(targetSessionIds[0]);

    if (serialized === null) {
      throw new Error(
        "Unable to read terminal buffer; terminal is not active.",
      );
    }

    return serialized;
  },

  "terminal-write": async (args, context) => {
    const targetSessionIds = resolveTerminalSessions(
      context,
      args?.paneId,
      args?.all,
    );

    for (const targetSessionId of targetSessionIds) {
      window.conduit.terminal.input(targetSessionId, args.input);

      if (args.enter) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        window.conduit.terminal.input(targetSessionId, "\r");
      }
    }
  },

  "terminal-wait": async (args, context) => {
    const [sessionId] = resolveTerminalSessions(context, args?.paneId, false);
    return waitForIdle(sessionId, args?.timeout);
  },
} satisfies Partial<HandlerMap>;
