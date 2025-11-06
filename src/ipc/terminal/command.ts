import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { TerminalInstance } from "./types";

const execFileAsync = promisify(execFile);

type ProcessInfo = {
  pid: number;
  ppid: number;
  stat: string;
  command: string;
};

const SHELL_PROCESS_NAMES = new Set(
  ["bash", "zsh", "fish", "sh", "ksh", "tcsh", "csh"].map((name) =>
    name.toLowerCase(),
  ),
);

/**
 * Normalizes a command string to extract the base binary name.
 * Handles login shells (starting with '-') and extracts basename.
 *
 * @example
 * normalizeBinaryName("vim /path/to/file") => "vim"
 * normalizeBinaryName("-bash") => "bash"
 */
const normalizeBinaryName = (command: string): string => {
  if (!command) {
    return "";
  }

  const firstToken = command.trim().split(/\s+/)[0] ?? "";
  const baseName = path.basename(firstToken);
  if (baseName.startsWith("-")) {
    return baseName.slice(1).toLowerCase();
  }
  return baseName.toLowerCase();
};

/**
 * Checks if a command is a shell process (bash, zsh, fish, etc.)
 */
const isShellProcess = (command: string): boolean => {
  const normalized = normalizeBinaryName(command);
  return normalized.length > 0 && SHELL_PROCESS_NAMES.has(normalized);
};

/**
 * Parses the output of `ps` command into structured process information.
 * Expected format: "pid ppid stat command"
 */
const parseProcessList = (output: string): ProcessInfo[] => {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) {
        return null;
      }

      const pid = Number.parseInt(match[1] ?? "", 10);
      const ppid = Number.parseInt(match[2] ?? "", 10);
      const stat = match[3] ?? "";
      const command = match[4] ?? "";

      if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !command) {
        return null;
      }

      const entry: ProcessInfo = { pid, ppid, stat, command };
      return entry;
    })
    .filter((entry): entry is ProcessInfo => entry !== null);
};

/**
 * Gets the TTY device associated with a process ID.
 * Returns null if the process has no TTY or on error.
 */
const getTtyForPid = async (pid: number): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync("ps", [
      "-p",
      String(pid),
      "-o",
      "tty=",
    ]);
    const tty = stdout.trim();
    if (!tty || tty === "?" || tty.toLowerCase() === "??") {
      return null;
    }
    return tty;
  } catch (error) {
    console.warn(`[Terminal Command] Failed to resolve TTY for pid ${pid}:`, error);
    return null;
  }
};

/**
 * Gets all processes running on a specific TTY device.
 */
const getProcessesForTty = async (tty: string): Promise<ProcessInfo[]> => {
  try {
    const { stdout } = await execFileAsync("ps", [
      "-t",
      tty,
      "-o",
      "pid=,ppid=,stat=,command=",
    ]);
    return parseProcessList(stdout);
  } catch (error) {
    console.warn(
      `[Terminal Command] Failed to list processes for TTY ${tty}:`,
      error,
    );
    return [];
  }
};

/**
 * Picks the most relevant active command from a process tree.
 * Performs BFS traversal starting from the shell PID.
 *
 * Priority:
 * 1. Foreground processes (stat contains '+')
 * 2. First non-shell child process (fallback)
 *
 * Skips:
 * - Shell processes (bash, zsh, etc.)
 * - Zombie processes (stat starts with 'Z')
 */
const pickActiveCommand = (
  processes: ProcessInfo[],
  shellPid: number,
): string | null => {
  if (processes.length === 0) {
    return null;
  }

  const childMap = new Map<number, ProcessInfo[]>();
  for (const entry of processes) {
    if (!childMap.has(entry.ppid)) {
      childMap.set(entry.ppid, []);
    }
    childMap.get(entry.ppid)!.push(entry);
  }

  const visited = new Set<number>([shellPid]);
  const queue: number[] = [shellPid];
  let fallback: string | null = null;

  while (queue.length > 0) {
    const currentPid = queue.shift()!;
    const children = childMap.get(currentPid);
    if (!children) {
      continue;
    }

    for (const child of children) {
      if (visited.has(child.pid)) {
        continue;
      }
      visited.add(child.pid);
      queue.push(child.pid);

      const command = child.command.trim();
      if (!command) {
        continue;
      }

      const isZombie = child.stat.startsWith("Z");
      if (isZombie) {
        continue;
      }

      const isShell = isShellProcess(command);
      if (!isShell) {
        if (child.stat.includes("+")) {
          return command;
        }

        if (fallback === null) {
          fallback = command;
        }
      }
    }
  }

  return fallback;
};

/**
 * Detects the active command running in a terminal using process introspection.
 * Works by examining the process tree associated with the terminal's TTY.
 *
 * @param session - The terminal instance to inspect
 * @returns The active command string, or null if no command is detected
 *
 * @remarks
 * Platform support:
 * - macOS/Linux: Full support via `ps` command
 * - Windows: Returns null (no process introspection support)
 *
 * Detection strategy:
 * 1. Get the shell's TTY device
 * 2. List all processes on that TTY
 * 3. Build process tree and find foreground non-shell processes
 * 4. Prioritize processes marked as foreground (stat contains '+')
 *
 * @example
 * // Terminal running "npm run dev"
 * const command = await detectActiveCommand(session);
 * // Returns: "npm run dev"
 *
 * // Terminal with idle shell
 * const command = await detectActiveCommand(session);
 * // Returns: null
 */
const detectActiveCommand = async (
  session: TerminalInstance,
): Promise<string | null> => {
  if (process.platform === "win32") {
    return null;
  }

  const shellPid = session.pty.pid;
  if (!Number.isInteger(shellPid) || shellPid <= 0) {
    return null;
  }

  const tty = await getTtyForPid(shellPid);
  if (!tty) {
    return null;
  }

  const processes = await getProcessesForTty(tty);
  if (processes.length === 0) {
    return null;
  }

  const command = pickActiveCommand(processes, shellPid);
  return command ? command.trim() : null;
};

/**
 * Attempts to get a command from the terminal's last known process title.
 * This is a fallback when process introspection fails.
 *
 * @param lastProcessName - The last known process name from the terminal
 * @returns The process name if it's not a shell, null otherwise
 */
const commandFromProcessTitle = (
  lastProcessName: string | undefined,
): string | null => {
  if (!lastProcessName) {
    return null;
  }

  const trimmed = lastProcessName.trim();
  if (!trimmed) {
    return null;
  }

  if (isShellProcess(trimmed)) {
    return null;
  }

  return trimmed;
};

/**
 * Captures the currently active command running in a terminal session.
 * Combines process introspection with process title fallback for best results.
 *
 * @param session - The terminal instance to capture command from
 * @returns The active command string, or null if no command is detected
 *
 * @remarks
 * This function tries two methods in order:
 * 1. Process introspection via `detectActiveCommand()` (most accurate)
 * 2. Fallback to last known process title (less accurate but works when introspection fails)
 *
 * @example
 * // Capture command from a running terminal
 * const terminal = getTerminal(sessionId);
 * const command = await captureTerminalCommand(terminal);
 * if (command) {
 *   console.log(`Terminal is running: ${command}`);
 * } else {
 *   console.log('Terminal has no active command');
 * }
 */
export async function captureTerminalCommand(
  session: TerminalInstance,
): Promise<string | null> {
  // Try process introspection first (most accurate)
  const activeCommand = await detectActiveCommand(session);
  if (activeCommand && activeCommand.length > 0) {
    return activeCommand;
  }

  // Fallback to last known process title
  return commandFromProcessTitle(session.lastProcessName);
}
