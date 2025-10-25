import { app, ipcMain } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Tab } from "../../renderer/types";
import type { Workspace } from "../../shared/types";
import { getAllSessions } from "../terminal/store";
import type { TerminalSession } from "../terminal/types";

export type SessionsFile = {
  sessions: Workspace[];
};

export type { Workspace as SavedSession };

function getSessionPath(): string {
  const homeDir = app.getPath("home");
  const conduitDir = path.join(homeDir, ".conduit");
  return path.join(conduitDir, "session.json");
}

async function ensureConduitDirectory(): Promise<void> {
  const homeDir = app.getPath("home");
  const conduitDir = path.join(homeDir, ".conduit");

  try {
    await fs.access(conduitDir);
  } catch {
    await fs.mkdir(conduitDir, { recursive: true });
  }
}

async function loadSessionsFile(): Promise<SessionsFile> {
  try {
    const sessionPath = getSessionPath();
    const data = await fs.readFile(sessionPath, "utf-8");
    return JSON.parse(data) as SessionsFile;
  } catch (error) {
    // File doesn't exist or is invalid, return empty sessions
    return { sessions: [] };
  }
}

async function saveSessionsFile(sessionsFile: SessionsFile): Promise<void> {
  const sessionPath = getSessionPath();
  await fs.writeFile(
    sessionPath,
    JSON.stringify(sessionsFile, null, 2),
    "utf-8"
  );
}

const execFileAsync = promisify(execFile);

type ProcessInfo = {
  pid: number;
  ppid: number;
  stat: string;
  command: string;
};

const SHELL_PROCESS_NAMES = new Set(
  ["bash", "zsh", "fish", "sh", "ksh", "tcsh", "csh"].map((name) =>
    name.toLowerCase()
  )
);

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

const isShellProcess = (command: string): boolean => {
  const normalized = normalizeBinaryName(command);
  return normalized.length > 0 && SHELL_PROCESS_NAMES.has(normalized);
};

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
    console.warn(`[Session Save] Failed to resolve TTY for pid ${pid}:`, error);
    return null;
  }
};

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
      `[Session Save] Failed to list processes for TTY ${tty}:`,
      error
    );
    return [];
  }
};

const pickActiveCommand = (
  processes: ProcessInfo[],
  shellPid: number
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

const detectActiveCommand = async (
  session: TerminalSession
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

const commandFromProcessTitle = (
  lastProcessName: string | undefined
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

export async function saveSession(
  name: string,
  tabs: Tab[],
  activeTabId: string | undefined,
  terminalSessions: Map<string, TerminalSession>
): Promise<Workspace[]> {
  try {
    await ensureConduitDirectory();

    const serializedTabs = await Promise.all(
      tabs.map(async (tab) => {
        const panes = await Promise.all(
          Object.values(tab.panes).map(async (pane) => {
            if (pane.type === "terminal") {
              const terminalSession = terminalSessions.get(pane.sessionId);

              let capturedCommand: string | null = null;
              if (terminalSession) {
                const activeCommand =
                  await detectActiveCommand(terminalSession);
                if (activeCommand && activeCommand.length > 0) {
                  capturedCommand = activeCommand;
                } else {
                  capturedCommand = commandFromProcessTitle(
                    terminalSession.lastProcessName
                  );
                }
              }

              if (capturedCommand) {
                console.log(
                  `[Session Save] Terminal ${pane.sessionId}: captured command="${capturedCommand}"`
                );
              } else {
                const lastProcess = terminalSession?.lastProcessName ?? "";
                console.log(
                  `[Session Save] Terminal ${pane.sessionId}: no active command detected (last process="${lastProcess}")`
                );
              }

              return {
                id: pane.id,
                type: "terminal" as const,
                cwd: pane.cwd,
                command: capturedCommand,
              };
            }

            return {
              id: pane.id,
              type: "webview" as const,
              url: pane.url,
              webTitle: pane.title,
            };
          })
        );

        return {
          id: tab.id,
          title: tab.title,
          mode: tab.mode,
          activePaneId: tab.activePaneId,
          panes,
          layout: tab.layout,
        };
      })
    );

    const newSession: Workspace = {
      name,
      timestamp: Date.now(),
      tabs: serializedTabs,
      activeTabId,
    };

    const sessionsFile = await loadSessionsFile();

    // Remove existing workspace with the same name if it exists
    sessionsFile.sessions = sessionsFile.sessions.filter(
      (s) => s.name !== name
    );

    // Add new/updated session to the beginning
    sessionsFile.sessions.unshift(newSession);

    // Keep only the most recent 10 sessions
    sessionsFile.sessions = sessionsFile.sessions.slice(0, 10);

    await saveSessionsFile(sessionsFile);

    return sessionsFile.sessions;
  } catch (error) {
    console.error("Failed to save session:", error);
    throw error;
  }
}

export async function loadSessions(): Promise<Workspace[]> {
  try {
    const sessionsFile = await loadSessionsFile();
    return sessionsFile.sessions;
  } catch (error) {
    console.error("Failed to load sessions:", error);
    return [];
  }
}

export async function hasSessions(): Promise<boolean> {
  try {
    const sessions = await loadSessions();
    return sessions.length > 0;
  } catch {
    return false;
  }
}

export async function deleteSession(timestamp: number): Promise<void> {
  try {
    const sessionsFile = await loadSessionsFile();
    sessionsFile.sessions = sessionsFile.sessions.filter(
      (s) => s.timestamp !== timestamp
    );
    await saveSessionsFile(sessionsFile);
  } catch (error) {
    console.error("Failed to delete session:", error);
  }
}

export async function renameWorkspace(
  currentName: string,
  newName: string
): Promise<Workspace[]> {
  try {
    const sessionsFile = await loadSessionsFile();
    const workspace = sessionsFile.sessions.find(
      (s) => s.name === currentName
    );

    if (!workspace) {
      throw new Error(`Workspace "${currentName}" not found`);
    }

    // Check if new name already exists
    const existingWithNewName = sessionsFile.sessions.find(
      (s) => s.name === newName
    );
    if (existingWithNewName) {
      throw new Error(`Workspace "${newName}" already exists`);
    }

    // Update the workspace name
    workspace.name = newName;

    await saveSessionsFile(sessionsFile);
    return sessionsFile.sessions;
  } catch (error) {
    console.error("Failed to rename workspace:", error);
    throw error;
  }
}

export function initializeWorkspaceHandlers() {
  ipcMain.handle("session:has-sessions", async () => {
    return await hasSessions();
  });

  ipcMain.handle("session:load-sessions", async () => {
    return await loadSessions();
  });

  ipcMain.handle(
    "session:save-session",
    async (_event, name, tabs, activeTabId) => {
      const terminalSessions = getAllSessions();
      return await saveSession(name, tabs, activeTabId, terminalSessions);
    }
  );

  ipcMain.handle("session:delete-session", async (_event, timestamp) => {
    await deleteSession(timestamp);
  });

  ipcMain.handle(
    "session:rename-workspace",
    async (_event, currentName, newName) => {
      return await renameWorkspace(currentName, newName);
    }
  );
}
