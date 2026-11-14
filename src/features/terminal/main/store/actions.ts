import { randomUUID } from "node:crypto";
import path from "node:path";

import { getTerminal, removeTerminal, storeTerminal } from ".";
import type { TerminalCreateOptions } from "../../model";
import { emit } from "../events";
import { resolveShell, spawnTerminalProcess } from "../pty";
import type { TerminalInstance } from "../types";

type UnsizedTerminal = {
  cwd: string;
  command?: string;
  input: string[];
  isRendererReady: boolean;
};

/** Terminals whose shell waits for their pane's first fit to start. */
const unsizedTerminals = new Map<string, UnsizedTerminal>();

/**
 * Output for a pane that hasn't shown yet, like one in a background tab of a
 * restored workspace, keeps only about what xterm's 1,000 lines of scrollback
 * would. It's trimmed in batches, at a line break, so a flood doesn't copy it
 * on every read.
 */
const MAX_BUFFERED_OUTPUT = 1_000_000;

export async function createTerminal(options?: TerminalCreateOptions) {
  const id = randomUUID();

  const cwd =
    options?.cwd ||
    path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? process.cwd());

  if (options?.waitForSize && !(options.cols && options.rows)) {
    unsizedTerminals.set(id, {
      cwd,
      command: options.command,
      input: [],
      isRendererReady: false,
    });
    return { id, cwd, title: path.basename(resolveShell()) };
  }

  const terminal = spawnTerminal(id, cwd, options);
  return { id, cwd, title: terminal.lastProcessName };
}

function spawnTerminal(
  id: string,
  cwd: string,
  options?: Pick<TerminalCreateOptions, "command" | "cols" | "rows">,
) {
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
    bufferedOutput: "",
    pendingCommand,
    cwd,
  };

  storeTerminal(terminal);
  setupTerminalListeners(terminal);

  return terminal;
}

function setupTerminalListeners(terminal: TerminalInstance) {
  const { id, pty } = terminal;

  pty.onData((data) => {
    if (terminal.isRendererReady) {
      emit("data", { sessionId: id, data });
    } else {
      bufferOutput(terminal, data);
    }

    // Conduit's shell integration reports the cwd as each prompt draws, so a
    // restored command runs at the first one, whether its tab is showing or not.
    if (terminal.pendingCommand && data.includes("\x1b]7;")) {
      runPendingCommand(terminal);
    }

    const processName = pty.process;
    if (processName && processName !== terminal.lastProcessName) {
      terminal.lastProcessName = processName;
    }
  });

  pty.onExit(({ exitCode, signal }) => {
    removeTerminal(id);

    emit("exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });
  });
}

function bufferOutput(terminal: TerminalInstance, data: string) {
  const output = terminal.bufferedOutput + data;
  if (output.length <= MAX_BUFFERED_OUTPUT) {
    terminal.bufferedOutput = output;
    return;
  }
  const lineStart = output.indexOf(
    "\n",
    output.length - MAX_BUFFERED_OUTPUT / 2,
  );
  terminal.bufferedOutput = output.slice(
    lineStart === -1 ? -MAX_BUFFERED_OUTPUT / 2 : lineStart + 1,
  );
}

function runPendingCommand(terminal: TerminalInstance) {
  if (!terminal.pendingCommand) return;
  terminal.pty.write(`${terminal.pendingCommand}\r`);
  terminal.pendingCommand = undefined;
}

/** Input sent before a shell starts, like an agent's command, waits for it. */
export function writeTerminal(terminalId: string, data: string) {
  const unsized = unsizedTerminals.get(terminalId);
  if (unsized) {
    unsized.input.push(data);
    return;
  }

  getTerminal(terminalId)?.pty.write(data);
}

export function resizeTerminal(terminalId: string, cols: number, rows: number) {
  cols = Math.max(1, Math.floor(cols));
  rows = Math.max(1, Math.floor(rows));

  const unsized = unsizedTerminals.get(terminalId);
  if (unsized) {
    unsizedTerminals.delete(terminalId);
    const terminal = spawnTerminal(terminalId, unsized.cwd, {
      command: unsized.command,
      cols,
      rows,
    });
    if (unsized.input.length > 0) terminal.pty.write(unsized.input.join(""));
    if (unsized.isRendererReady) markTerminalReady(terminalId);
    return;
  }

  getTerminal(terminalId)?.pty.resize(cols, rows);
}

export async function killTerminal(terminalId: string) {
  if (unsizedTerminals.delete(terminalId)) return;

  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  removeTerminal(terminalId);

  try {
    terminal.pty.kill();
  } catch (error) {
    console.error("Failed to terminate PTY session", error);
  }
}

export function markTerminalReady(terminalId: string) {
  const unsized = unsizedTerminals.get(terminalId);
  if (unsized) {
    unsized.isRendererReady = true;
    return;
  }

  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  terminal.isRendererReady = true;

  // Flush all buffered output as a single message to avoid race conditions
  if (terminal.bufferedOutput) {
    emit("data", { sessionId: terminal.id, data: terminal.bufferedOutput });
    terminal.bufferedOutput = "";
  }

  // A shell without Conduit's integration, like fish, never reports a prompt.
  runPendingCommand(terminal);
}
