import { waitForIdle } from "@/components/panes/terminal/state/stateTracker";
import { serializeSession } from "@/components/panes/terminal/state/xtermCache";
import type { HandlerMap } from "./types";

export const terminalHandlers: Partial<HandlerMap> = {
  "terminal-read": async (args, context) => {
    const targetSessionIds = context.resolveTerminalSessions(
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
    const targetSessionIds = context.resolveTerminalSessions(
      args?.paneId,
      args?.all,
    );

    for (const targetSessionId of targetSessionIds) {
      window.conduit.sendKeypress(targetSessionId, args.input);

      if (args.enter) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        window.conduit.sendKeypress(targetSessionId, "\r");
      }
    }
  },

  "terminal-wait": async (args, context) => {
    const [sessionId] = context.resolveTerminalSessions(args?.paneId, false);
    return waitForIdle(sessionId, args?.timeout);
  },
};
