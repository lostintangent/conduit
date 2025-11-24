import { ipcMain } from "electron";
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
import type { CreateTerminalOptions, SendToRendererFn } from "./types";

const CHANNEL = "terminal";
export function initializeTerminalHandlers(sendToRenderer: SendToRendererFn) {
  initializePromptHandlers();

  ipcMain.handle(
    `${CHANNEL}:create`,
    async (_, payload: CreateTerminalOptions) => {
      const terminal = await createTerminal(sendToRenderer, payload);

      return {
        sessionId: terminal.id,
        title: terminal.lastProcessName,
        cwd: terminal.cwd,
        vmId: terminal.vmId,
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

export function cleanupTerminalSessions() {
  Array.from(getAllTerminals().keys()).forEach((sessionId) => {
    try {
      killTerminal(sessionId);
    } catch (error) {
      console.error("Failed to terminate PTY session", error);
    }
  });
}
