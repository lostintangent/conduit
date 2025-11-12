import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tab } from "../../renderer/types";
import type { Workspace } from "../../shared/types";
import { captureTerminalCommand } from "../terminal/command";
import { getAllTerminals } from "../terminal/store";
import type { TerminalInstance } from "../terminal/types";

export type SessionsFile = {
  sessions: Workspace[];
  lastWorkspace?: Workspace;
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
    "utf-8",
  );
}

type TabPane = Tab["panes"][string];
type SerializedTab = Workspace["tabs"][number];
type SerializedPane = SerializedTab["panes"][number];

type SerializeTabsOptions = {
  logTerminalActivity?: boolean;
};

const serializePane = async (
  pane: TabPane,
  terminalSessions: Map<string, TerminalInstance>,
  options: SerializeTabsOptions,
): Promise<SerializedPane> => {
  if (pane.type === "terminal") {
    const terminalSession = terminalSessions.get(pane.sessionId);

    let capturedCommand: string | null = null;
    if (terminalSession) {
      capturedCommand = await captureTerminalCommand(terminalSession);
    }

    if (options.logTerminalActivity) {
      if (capturedCommand) {
        console.log(
          `[Session Save] Terminal ${pane.sessionId}: captured command="${capturedCommand}"`,
        );
      } else {
        const lastProcess = terminalSession?.lastProcessName ?? "";
        console.log(
          `[Session Save] Terminal ${pane.sessionId}: no active command detected (last process="${lastProcess}")`,
        );
      }
    }

    return {
      id: pane.id,
      type: "terminal",
      cwd: pane.cwd,
      command: capturedCommand,
    };
  }

  if (pane.type === "editor") {
    return {
      id: pane.id,
      type: "editor",
      cwd: pane.cwd,
      filePath: pane.filePath,
    };
  }

  return {
    id: pane.id,
    type: "webview",
    url: pane.url,
    webTitle: pane.title,
  };
};

const serializeTabs = async (
  tabs: Tab[],
  terminalSessions: Map<string, TerminalInstance>,
  options: SerializeTabsOptions = {},
): Promise<Workspace["tabs"]> => {
  return Promise.all(
    tabs.map(async (tab) => {
      const panes = await Promise.all(
        Object.values(tab.panes).map((pane) =>
          serializePane(pane, terminalSessions, options),
        ),
      );

      return {
        id: tab.id,
        title: tab.title,
        activePaneId: tab.activePaneId,
        locked: tab.locked,
        panes,
        layout: tab.layout,
      };
    }),
  );
};

export async function saveSession(
  name: string,
  tabs: Tab[],
  activeTabId: string | undefined,
  terminalSessions: Map<string, TerminalInstance>,
): Promise<Workspace[]> {
  try {
    await ensureConduitDirectory();

    const serializedTabs = await serializeTabs(tabs, terminalSessions, {
      logTerminalActivity: true,
    });

    const newSession: Workspace = {
      name,
      timestamp: Date.now(),
      tabs: serializedTabs,
      activeTabId,
    };

    const sessionsFile = await loadSessionsFile();

    // Remove existing workspace with the same name if it exists
    sessionsFile.sessions = sessionsFile.sessions.filter(
      (s) => s.name !== name,
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
      (s) => s.timestamp !== timestamp,
    );
    await saveSessionsFile(sessionsFile);
  } catch (error) {
    console.error("Failed to delete session:", error);
  }
}

export async function saveLastWorkspace(
  tabs: Tab[],
  activeTabId: string | undefined,
  terminalSessions: Map<string, TerminalInstance>,
): Promise<void> {
  try {
    await ensureConduitDirectory();

    const serializedTabs = await serializeTabs(tabs, terminalSessions);

    const lastWorkspace: Workspace = {
      name: "__last_workspace__",
      timestamp: Date.now(),
      tabs: serializedTabs,
      activeTabId,
    };

    const sessionsFile = await loadSessionsFile();
    sessionsFile.lastWorkspace = lastWorkspace;

    await saveSessionsFile(sessionsFile);
    console.log("[Session Save] Last workspace saved successfully");
  } catch (error) {
    console.error("Failed to save last workspace:", error);
  }
}

export async function loadLastWorkspace(): Promise<Workspace | null> {
  try {
    const sessionsFile = await loadSessionsFile();
    return sessionsFile.lastWorkspace ?? null;
  } catch (error) {
    console.error("Failed to load last workspace:", error);
    return null;
  }
}

export async function hasLastWorkspace(): Promise<boolean> {
  try {
    const lastWorkspace = await loadLastWorkspace();
    return lastWorkspace !== null;
  } catch {
    return false;
  }
}

export async function renameWorkspace(
  currentName: string,
  newName: string,
): Promise<Workspace[]> {
  try {
    // Prevent renaming the special last workspace
    if (currentName === "__last_workspace__") {
      throw new Error("Cannot rename the last workspace");
    }

    const sessionsFile = await loadSessionsFile();
    const workspace = sessionsFile.sessions.find((s) => s.name === currentName);

    if (!workspace) {
      throw new Error(`Workspace "${currentName}" not found`);
    }

    // Check if new name already exists
    const existingWithNewName = sessionsFile.sessions.find(
      (s) => s.name === newName,
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

export function initializeWorkspaceHandlers(
  refreshApplicationMenu: () => Promise<void>,
) {
  ipcMain.handle("session:has-sessions", async () => {
    return await hasSessions();
  });

  ipcMain.handle("session:load-sessions", async () => {
    return await loadSessions();
  });

  ipcMain.handle(
    "session:save-session",
    async (_event, name, tabs, activeTabId) => {
      const terminalSessions = getAllTerminals();
      const result = await saveSession(
        name,
        tabs,
        activeTabId,
        terminalSessions,
      );
      await refreshApplicationMenu();

      return result;
    },
  );

  ipcMain.handle("session:delete-session", async (_event, timestamp) => {
    await deleteSession(timestamp);
    await refreshApplicationMenu();
  });

  ipcMain.handle(
    "session:rename-workspace",
    async (_event, currentName, newName) => {
      const result = await renameWorkspace(currentName, newName);
      await refreshApplicationMenu();

      return result;
    },
  );

  ipcMain.handle("session:has-last-workspace", async () => {
    return await hasLastWorkspace();
  });

  ipcMain.handle("session:load-last-workspace", async () => {
    return await loadLastWorkspace();
  });

  ipcMain.handle(
    "session:save-last-workspace",
    async (_event, tabs, activeTabId) => {
      const terminalSessions = getAllTerminals();
      await saveLastWorkspace(tabs, activeTabId, terminalSessions);
    },
  );
}
