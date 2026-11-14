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

/**
 * A restored command is typed once the shell's line editor has the terminal,
 * which zsh, bash 5.1 and fish announce by turning on bracketed paste. Typed
 * any earlier, the terminal echoes it above the prompt and the shell draws it
 * again on the prompt line. A shell that never announces it, like macOS's
 * bash 3.2, gets the command typed ahead after a few seconds.
 */
const LINE_EDITOR_READY = "\x1b[?2004h";
const LINE_EDITOR_TIMEOUT_MS = 3_000;

/**
 * A shell whose output gets this many characters ahead of what the renderer
 * has parsed pauses until the renderer is within the low watermark, so a
 * flood can't queue up behind a keystroke's echo or overflow xterm. These are
 * VS Code's values.
 */
const HIGH_WATERMARK = 100_000;
const LOW_WATERMARK = 5_000;

/**
 * A paused shell can exit with its last line still in the pty, which node-pty
 * closes 200 ms after the exit, read or not. So a paused shell is checked on
 * this often, and once it's gone, its pty is read to the end.
 */
const EXIT_CHECK_MS = 50;

const COALESCE_MS = 5;

/**
 * Output nobody can see waits longer, since each message costs both
 * processes, but no longer than it takes to fill the high watermark.
 */
const HIDDEN_COALESCE_MS = 250;

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
  return { id, cwd, title: terminal.pty.process };
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
    isRendererReady: false,
    bufferedOutput: "",
    unacknowledged: 0,
    pendingCommand,
    cwd,
  };

  storeTerminal(terminal);
  setupTerminalListeners(terminal);

  if (pendingCommand) {
    setTimeout(() => {
      if (getTerminal(id) === terminal) runPendingCommand(terminal);
    }, LINE_EDITOR_TIMEOUT_MS);
  }

  return terminal;
}

function setupTerminalListeners(terminal: TerminalInstance) {
  const { id, pty } = terminal;

  // A pty reads at most 1 KB at a time, so a burst of output is thousands of
  // reads. The first read goes out right away, like a keystroke's echo, and
  // the rest of a burst goes out every few milliseconds as one message.
  let pending = "";
  let coalescing: NodeJS.Timeout | undefined;
  const flush = () => {
    clearTimeout(coalescing);
    if (!pending) {
      coalescing = undefined;
      return;
    }
    emitOutput(terminal, pending);
    pending = "";
    coalescing = setTimeout(
      flush,
      terminal.isHidden ? HIDDEN_COALESCE_MS : COALESCE_MS,
    );
  };
  terminal.flushOutput = flush;

  pty.onData((data) => {
    if (!terminal.isRendererReady) {
      bufferOutput(terminal, data);
    } else if (terminal.isHidden) {
      pending += data;
      coalescing ??= setTimeout(flush, HIDDEN_COALESCE_MS);
      if (pending.length >= HIGH_WATERMARK) flush();
    } else if (coalescing) {
      pending += data;
    } else {
      emitOutput(terminal, data);
      coalescing = setTimeout(flush, COALESCE_MS);
    }

    if (terminal.pendingCommand && data.includes(LINE_EDITOR_READY)) {
      runPendingCommand(terminal);
    }
  });

  pty.onExit(({ exitCode, signal }) => {
    clearTimeout(coalescing);
    clearInterval(terminal.exitCheck);
    if (pending) emit("data", { sessionId: id, data: pending });
    removeTerminal(id);

    emit("exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });
  });
}

function emitOutput(terminal: TerminalInstance, data: string) {
  emit("data", { sessionId: terminal.id, data });
  terminal.unacknowledged += data.length;
  if (
    terminal.unacknowledged > HIGH_WATERMARK &&
    !terminal.exitCheck &&
    !terminal.hasExited
  ) {
    pause(terminal);
  }
}

/** The renderer has parsed this many more characters of a shell's output. */
export function acknowledgeTerminalOutput(terminalId: string, chars: number) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;
  terminal.unacknowledged = Math.max(0, terminal.unacknowledged - chars);
  if (terminal.exitCheck && terminal.unacknowledged < LOW_WATERMARK) {
    resume(terminal);
  }
}

/** Whether any pane shows a shell, which decides how long its output waits. */
export function setTerminalVisible(terminalId: string, visible: boolean) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;
  terminal.isHidden = !visible;
  if (visible) terminal.flushOutput?.();
}

function pause(terminal: TerminalInstance) {
  terminal.pty.pause();
  terminal.exitCheck = setInterval(() => {
    if (isRunning(terminal.pty.pid)) return;
    terminal.hasExited = true;
    resume(terminal);
  }, EXIT_CHECK_MS);
}

function resume(terminal: TerminalInstance) {
  clearInterval(terminal.exitCheck);
  terminal.exitCheck = undefined;
  terminal.pty.resume();
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Like a shell replaced by `sudo`, which still has the pty.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
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
    emitOutput(terminal, terminal.bufferedOutput);
    terminal.bufferedOutput = "";
  }
}
