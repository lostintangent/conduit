import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  getSession,
  removeSession,
  storeSession,
} from ".";
import { consumeOscSequences, normalizeCwd, startCwdPolling } from "../cwd";
import { resolveShell, spawnTerminalProcess } from "../pty";
import type {
  CreateSessionOptions,
  SendToRendererFn,
  TerminalSession,
} from "../types";

const disposeSessionResources = (session: TerminalSession) => {
  session.oscBuffer = "";
  if (session.cwdPoller) {
    clearInterval(session.cwdPoller);
    session.cwdPoller = undefined;
  }
  if (session.pendingCwdPoll) {
    clearTimeout(session.pendingCwdPoll);
    session.pendingCwdPoll = undefined;
  }
  session.isPollingCwd = false;
  session.scheduleCwdPoll = undefined;
  session.pendingOutput = [];
  if (session.readyFallback) {
    clearTimeout(session.readyFallback);
    session.readyFallback = undefined;
  }
};

const describeProcess = (session: TerminalSession) => {
  if (session.lastProcessName && session.lastProcessName.trim().length > 0) {
    return session.lastProcessName;
  }

  return path.parse(resolveShell()).name || "Shell";
};

export const createSession = (
  sendToRenderer: SendToRendererFn,
  options?: CreateSessionOptions
) => {
  const defaultDirectory = path.resolve(process.env.HOME ?? process.cwd());
  const normalizedOverride = options?.cwd ? normalizeCwd(options.cwd) : null;
  const initialDirectory = normalizedOverride ?? defaultDirectory;

  const pty = spawnTerminalProcess(initialDirectory);
  const id = randomUUID();

  const session: TerminalSession = {
    id,
    pty,
    lastProcessName: pty.process,
    cwd: normalizeCwd(initialDirectory) ?? initialDirectory,
    oscBuffer: "",
    cwdPoller: undefined,
    isPollingCwd: false,
    pendingCwdPoll: undefined,
    scheduleCwdPoll: undefined,
    isRendererReady: false,
    pendingOutput: [],
    readyFallback: undefined,
  };

  storeSession(session);

  pty.onData((data) => {
    if (session.isRendererReady) {
      sendToRenderer("terminal:data", { sessionId: id, data });
    } else {
      session.pendingOutput.push(data);
    }

    const processName = pty.process;
    if (processName && processName !== session.lastProcessName) {
      session.lastProcessName = processName;
      sendToRenderer("terminal:title", { sessionId: id, title: processName });
    }

    consumeOscSequences(session, data, sendToRenderer);
  });

  pty.onExit(({ exitCode, signal }) => {
    disposeSessionResources(session);

    sendToRenderer("terminal:exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });

    setTimeout(() => {
      const current = getSession(id);
      if (current && current.pty === session.pty) {
        removeSession(id);
      }
    }, 2000);
  });

  const title = describeProcess(session);
  session.lastProcessName = title;
  sendToRenderer("terminal:title", {
    sessionId: id,
    title,
  });
  sendToRenderer("terminal:cwd", {
    sessionId: id,
    cwd: session.cwd,
  });

  startCwdPolling(session, sendToRenderer);

  session.readyFallback = setTimeout(() => {
    if (!session.isRendererReady) {
      console.log(
        `[main] Fallback timeout triggered for session ${id}, marking ready`
      );
      session.isRendererReady = true;
      if (session.pendingOutput.length > 0) {
        session.pendingOutput.forEach((data) => {
          sendToRenderer("terminal:data", { sessionId: session.id, data });
        });
        session.pendingOutput = [];
      }
    }
  }, 750);

  return session;
};

export const closeSession = (sessionId: string) => {
  const session = getSession(sessionId);
  if (!session) {
    return;
  }

  removeSession(sessionId);
  disposeSessionResources(session);
  try {
    session.pty.kill();
  } catch (error) {
    console.error("Failed to terminate PTY session", error);
  }
};

export const markSessionReady = (
  sessionId: string,
  sendToRenderer: SendToRendererFn
) => {
  const session = getSession(sessionId);
  if (!session) {
    return;
  }

  session.isRendererReady = true;
  if (session.readyFallback) {
    clearTimeout(session.readyFallback);
    session.readyFallback = undefined;
  }
  if (session.pendingOutput.length > 0) {
    session.pendingOutput.forEach((data) =>
      sendToRenderer("terminal:data", { sessionId: session.id, data }));

    session.pendingOutput = [];
  }
};
