import { ipcMain } from "electron";
import type {
  TerminalInputPayload,
  TerminalPayload,
  TerminalResizePayload,
} from "../../shared/types";
import { closeSession, createSession, markSessionReady } from "./store/actions";
import { getAllSessions, getSession } from "./store";
import type { CreateSessionOptions, SendToRendererFn } from "./types";

export function initializeTerminalHandlers(sendToRenderer: SendToRendererFn) {
  ipcMain.handle("terminal:create", async (_, payload: CreateSessionOptions) => {
    const session = await createSession(sendToRenderer, payload);
    return {
      sessionId: session.id,
      title: session.lastProcessName,
      cwd: session.cwd,
      vmMetadata: session.vmMetadata,
    };
  });

  ipcMain.on("terminal:ready", (_, { sessionId }: TerminalPayload) =>
    markSessionReady(sessionId, sendToRenderer)
  );

  ipcMain.on("terminal:close", (_, { sessionId }: TerminalPayload) =>
    closeSession(sessionId)
  );

  ipcMain.on("terminal:input", (_, { sessionId, input }: TerminalInputPayload) => {
    const session = getSession(sessionId);
    if (!session) return;

    session.pty.write(input);
  });

  ipcMain.on("terminal:resize", (_event, payload: TerminalResizePayload) => {
    const session = getSession(payload.sessionId);
    if (!session) return;

    const cols = Math.max(1, Math.floor(payload.cols));
    const rows = Math.max(1, Math.floor(payload.rows));

    session.pty.resize(cols, rows);
  });
}

export function cleanupTerminalSessions() {
  Array.from(getAllSessions().keys()).forEach((sessionId) => {
    try {
      closeSession(sessionId);
    } catch (error) {
      console.error("Failed to terminate PTY session", error);
    }
  });
}
