import type { HandlerSubset } from "./types";
import { serializeSession } from "@/components/panes/terminal/xtermCache";

export const terminalHandlers: HandlerSubset = {
  "terminal-read": async (args, context) => {
    const targetSessionIds = context.resolveTerminalSessions(
      args?.paneId,
      args?.all,
    );

    if (!targetSessionIds) {
      return;
    }

    if (targetSessionIds.length > 1) {
      const results: string[] = [];
      for (const targetSessionId of targetSessionIds) {
        const serialized = serializeSession(targetSessionId);
        if (serialized !== null) {
          results.push(serialized);
        }
      }

      if (results.length === 0) {
        context.respondError("Unable to read terminal buffers.");
        return;
      }

      context.respondResult(results.join("\n---\n"));
      return;
    }

    const serialized = serializeSession(targetSessionIds[0]);

    if (serialized === null) {
      context.respondError(
        "Unable to read terminal buffer; terminal is not active.",
      );
      return;
    }

    context.respondResult(serialized);
  },

  "terminal-write": async (args, context) => {
    const targetSessionIds = context.resolveTerminalSessions(
      args?.paneId,
      args?.all,
    );

    if (!targetSessionIds) {
      return;
    }

    for (const targetSessionId of targetSessionIds) {
      window.conduit.sendKeypress(targetSessionId, args.input);

      if (args.enter) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        window.conduit.sendKeypress(targetSessionId, "\r");
      }
    }

    context.respondResult();
  },
};
