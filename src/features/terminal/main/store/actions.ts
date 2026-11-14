import { randomUUID } from "node:crypto";
import path from "node:path";

import type { TerminalCreateOptions } from "@shared/types";
import { getTerminal, removeTerminal, storeTerminal } from ".";
import { resolveShell, spawnTerminalProcess } from "../pty";
import type { SendToRendererFn, TerminalInstance } from "../types";

export async function createTerminal(
  sendToRenderer: SendToRendererFn,
  options?: TerminalCreateOptions,
) {
  const id = randomUUID();

  const cwd =
    options?.cwd ??
    path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? process.cwd());
  const pty = spawnTerminalProcess(id, cwd, options?.cols, options?.rows);

  let pendingCommand = options?.command;
  const shell = resolveShell();

  // If the command is the same as the shell, we don't need to run it
  // This happens when restoring a terminal that was just a shell
  if (
    pendingCommand &&
    (pendingCommand === shell || pendingCommand === path.basename(shell))
  ) {
    pendingCommand = undefined;
  }

  const terminal: TerminalInstance = {
    id,
    pty,
    lastProcessName: pty.process,
    isRendererReady: false,
    bufferedOutput: [],
    pendingCommand,
    cwd,
  };

  storeTerminal(terminal);
  setupTerminalListeners(terminal, sendToRenderer);

  return terminal;
}

function setupTerminalListeners(
  terminal: TerminalInstance,
  sendToRenderer: SendToRendererFn,
) {
  const { id, pty } = terminal;

  pty.onData((data) => {
    if (terminal.isRendererReady) {
      sendToRenderer("terminal:data", { sessionId: id, data });
    } else {
      terminal.bufferedOutput.push(data);
    }

    const processName = pty.process;
    if (processName && processName !== terminal.lastProcessName) {
      terminal.lastProcessName = processName;
    }
  });

  pty.onExit(({ exitCode, signal }) => {
    removeTerminal(id);

    sendToRenderer("terminal:exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });
  });
}

export async function killTerminal(terminalId: string) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  removeTerminal(terminalId);

  try {
    terminal.pty.kill();
  } catch (error) {
    console.error("Failed to terminate PTY session", error);
  }
}

export function markTerminalReady(
  terminalId: string,
  sendToRenderer: SendToRendererFn,
) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  terminal.isRendererReady = true;

  // Flush all buffered output as a single message to avoid race conditions
  if (terminal.bufferedOutput.length > 0) {
    const data = terminal.bufferedOutput.join("");
    sendToRenderer("terminal:data", { sessionId: terminal.id, data });
    terminal.bufferedOutput = [];
  }

  // Execute any pending command (from workspace restore)
  if (terminal.pendingCommand) {
    terminal.pty.write(`${terminal.pendingCommand}\r`);
    terminal.pendingCommand = undefined;
  }
}
