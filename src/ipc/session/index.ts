import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tab } from "../../renderer/types";
import type { SavedSession } from "../../shared/types";

export type SessionsFile = {
  sessions: SavedSession[];
};

export type { SavedSession };

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

export async function saveSession(
  name: string,
  tabs: Tab[],
  terminalSessions: Map<string, any>
): Promise<SavedSession[]> {
  try {
    await ensureConduitDirectory();

    const newSession: SavedSession = {
      name,
      timestamp: Date.now(),
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        mode: tab.mode,
        activePaneId: tab.activePaneId,
        panes: Object.values(tab.panes).map((pane) => {
          if (pane.type === "terminal") {
            // Get the actual terminal session from main process
            const terminalSession = terminalSessions.get(pane.sessionId);
            const lastProcessName = terminalSession?.lastProcessName || "";

            // Filter out shell processes (bash, zsh, fish, sh, etc.)
            const shellProcesses = [
              "bash",
              "zsh",
              "fish",
              "sh",
              "ksh",
              "tcsh",
              "csh",
            ];

            // Check if it's just a shell (strip path and check name)
            const processName = lastProcessName.split("/").pop() || "";
            const processLower = processName.toLowerCase();
            const isJustShell = shellProcesses.some(
              (shell) => processLower === shell || processLower === `-${shell}`
            );

            // Save the command if it's not just a shell prompt
            const command =
              !isJustShell && processName.length > 0 ? processName : null;

            console.log(
              `[Session Save] Terminal ${pane.sessionId}: lastProcessName="${lastProcessName}", command="${command}"`
            );

            return {
              id: pane.id,
              type: "terminal" as const,
              cwd: pane.cwd,
              command: command,
            };
          } else {
            return {
              id: pane.id,
              type: "webview" as const,
              url: pane.url,
              webTitle: pane.title,
            };
          }
        }),
        layout: tab.layout,
      })),
      activeTabId: tabs.find((tab) => tab.isActive)?.id,
    };

    const sessionsFile = await loadSessionsFile();

    // Add new session to the beginning
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

export async function loadSessions(): Promise<SavedSession[]> {
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
