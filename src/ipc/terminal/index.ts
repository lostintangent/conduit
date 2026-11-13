import type { TerminalCreateOptions } from "@shared/types";
import { ipcMain } from "electron";
import { setTimeout as delay } from "node:timers/promises";
import type {
  TerminalInputPayload,
  TerminalPayload,
  TerminalResizePayload,
} from "../../shared/types";
import { captureTerminalCommand } from "./command";
import { initializePromptHandlers } from "./prompt";
import { getAllTerminals, getTerminal } from "./store";
import {
  createTerminal,
  killTerminal,
  markTerminalReady,
} from "./store/actions";
import type { SendToRendererFn } from "./types";

const CHANNEL = "terminal";
export function initializeTerminalHandlers(sendToRenderer: SendToRendererFn) {
  initializePromptHandlers();

  ipcMain.handle(
    `${CHANNEL}:create`,
    async (_, payload: TerminalCreateOptions) => {
      const terminal = await createTerminal(sendToRenderer, payload);
      return {
        sessionId: terminal.id,
        title: terminal.lastProcessName,
        cwd: terminal.cwd,
      };
    },
  );

  ipcMain.handle(
    `${CHANNEL}:capture-command`,
    async (_, { sessionId }: TerminalPayload) => {
      const terminal = getTerminal(sessionId);
      if (!terminal) {
        return null;
      }

      const command = await captureTerminalCommand(terminal);
      return command;
    },
  );

  ipcMain.on(`${CHANNEL}:ready`, (_, { sessionId }: TerminalPayload) =>
    markTerminalReady(sessionId, sendToRenderer),
  );

  ipcMain.on(`${CHANNEL}:close`, (_, { sessionId }: TerminalPayload) =>
    killTerminal(sessionId),
  );

  ipcMain.on(
    `${CHANNEL}:input`,
    (_, { sessionId, input }: TerminalInputPayload) => {
      const session = getTerminal(sessionId);
      if (!session) return;

      session.pty.write(input);
    },
  );

  ipcMain.on(`${CHANNEL}:resize`, (_event, payload: TerminalResizePayload) => {
    const session = getTerminal(payload.sessionId);
    if (!session) return;

    const cols = Math.max(1, Math.floor(payload.cols));
    const rows = Math.max(1, Math.floor(payload.rows));

    session.pty.resize(cols, rows);
  });
}

/** How long shells get to exit on SIGHUP before quit sends SIGKILL. */
const HANGUP_GRACE_MS = 500;

/**
 * Kill every PTY and wait for its exit callback. node-pty delivers exits on a
 * native thread, and one that lands while Node is tearing down aborts the
 * process (microsoft/node-pty#904). Teardown also joins that thread, so a
 * shell that survives SIGHUP would hang quit, and those get SIGKILL.
 */
export async function cleanupTerminalSessions() {
  const running = new Set(getAllTerminals().values());
  const exits = Array.from(
    running,
    (terminal) =>
      new Promise<void>((resolve) =>
        terminal.pty.onExit(() => {
          running.delete(terminal);
          resolve();
        }),
      ),
  );

  await Promise.all(
    Array.from(running, (terminal) =>
      killTerminal(terminal.id).catch((error) =>
        console.error("Failed to terminate PTY session", error),
      ),
    ),
  );

  const allExited = Promise.all(exits);
  await Promise.race([allExited, delay(HANGUP_GRACE_MS)]);
  for (const terminal of running) {
    terminal.pty.kill("SIGKILL");
  }

  await allExited;
}
