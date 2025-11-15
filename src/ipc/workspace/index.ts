import { BrowserWindow, app, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tab } from "../../renderer/types";
import type { Workspace } from "../../shared/types";
import { captureTerminalCommand } from "../terminal/command";
import { getAllTerminals } from "../terminal/store";
import type { TerminalInstance } from "../terminal/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export type WorkspacesFile = {
  workspaces: Workspace[];
  lastWorkspace?: Workspace;
};

export type { Workspace as SavedWorkspace };

function getWorkspaceStorePath(): string {
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

async function loadWorkspacesFile(): Promise<WorkspacesFile> {
  try {
    const sessionPath = getWorkspaceStorePath();
    const data = await fs.readFile(sessionPath, "utf-8");
    const parsed = JSON.parse(data) as unknown;

    if (isRecord(parsed)) {
      const workspaces = parsed["workspaces"];
      const lastWorkspace = parsed["lastWorkspace"];

      if (Array.isArray(workspaces)) {
        return {
          workspaces: workspaces as Workspace[],
          lastWorkspace: lastWorkspace as Workspace | undefined,
        };
      }

      const legacySessions = parsed["sessions"];
      if (Array.isArray(legacySessions)) {
        return {
          workspaces: legacySessions as Workspace[],
          lastWorkspace: lastWorkspace as Workspace | undefined,
        };
      }
    }

    return { workspaces: [] };
  } catch (error) {
    // File doesn't exist or is invalid, return empty workspaces
    return { workspaces: [] };
  }
}

async function saveWorkspacesFile(
  workspacesFile: WorkspacesFile,
): Promise<void> {
  const sessionPath = getWorkspaceStorePath();
  await fs.writeFile(
    sessionPath,
    JSON.stringify(
      {
        workspaces: workspacesFile.workspaces,
        ...(workspacesFile.lastWorkspace && {
          lastWorkspace: workspacesFile.lastWorkspace,
        }),
      },
      null,
      2,
    ),
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
          `[Workspace Save] Terminal ${pane.sessionId}: captured command="${capturedCommand}"`,
        );
      } else {
        const lastProcess = terminalSession?.lastProcessName ?? "";
        console.log(
          `[Workspace Save] Terminal ${pane.sessionId}: no active command detected (last process="${lastProcess}")`,
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
    ...(pane.devToolsForPane && { devToolsForPane: pane.devToolsForPane }),
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

export async function saveWorkspaceSnapshot(
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

    const newWorkspace: Workspace = {
      name,
      timestamp: Date.now(),
      tabs: serializedTabs,
      activeTabId,
    };

    const workspacesFile = await loadWorkspacesFile();

    // Remove existing workspace with the same name if it exists
    workspacesFile.workspaces = workspacesFile.workspaces.filter(
      (workspace) => workspace.name !== name,
    );

    // Add new/updated workspace to the beginning
    workspacesFile.workspaces.unshift(newWorkspace);

    // Keep only the most recent 10 workspaces
    workspacesFile.workspaces = workspacesFile.workspaces.slice(0, 10);

    await saveWorkspacesFile(workspacesFile);

    return workspacesFile.workspaces;
  } catch (error) {
    console.error("Failed to save workspace:", error);
    throw error;
  }
}

export async function loadWorkspaces(): Promise<Workspace[]> {
  try {
    const workspacesFile = await loadWorkspacesFile();
    return workspacesFile.workspaces;
  } catch (error) {
    console.error("Failed to load workspaces:", error);
    return [];
  }
}

export async function hasWorkspaces(): Promise<boolean> {
  try {
    const workspaces = await loadWorkspaces();
    return workspaces.length > 0;
  } catch {
    return false;
  }
}

export async function deleteWorkspaceByTimestamp(
  timestamp: number,
): Promise<void> {
  try {
    const workspacesFile = await loadWorkspacesFile();
    workspacesFile.workspaces = workspacesFile.workspaces.filter(
      (workspace) => workspace.timestamp !== timestamp,
    );
    await saveWorkspacesFile(workspacesFile);
  } catch (error) {
    console.error("Failed to delete workspace:", error);
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

    const workspacesFile = await loadWorkspacesFile();
    workspacesFile.lastWorkspace = lastWorkspace;

    await saveWorkspacesFile(workspacesFile);
    console.log("[Workspace Save] Last workspace saved successfully");
  } catch (error) {
    console.error("Failed to save last workspace:", error);
  }
}

export async function loadLastWorkspace(): Promise<Workspace | null> {
  try {
    const workspacesFile = await loadWorkspacesFile();
    return workspacesFile.lastWorkspace ?? null;
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

    const workspacesFile = await loadWorkspacesFile();
    const workspace = workspacesFile.workspaces.find(
      (entry) => entry.name === currentName,
    );

    if (!workspace) {
      throw new Error(`Workspace "${currentName}" not found`);
    }

    // Check if new name already exists
    const existingWithNewName = workspacesFile.workspaces.find(
      (entry) => entry.name === newName,
    );
    if (existingWithNewName) {
      throw new Error(`Workspace "${newName}" already exists`);
    }

    // Update the workspace name
    workspace.name = newName;

    await saveWorkspacesFile(workspacesFile);
    return workspacesFile.workspaces;
  } catch (error) {
    console.error("Failed to rename workspace:", error);
    throw error;
  }
}

function extractWorkspaceFromData(data: unknown): Workspace | null {
  if (isRecord(data)) {
    const workspaces = data["workspaces"];
    if (Array.isArray(workspaces)) {
      const candidate = workspaces[0];
      if (candidate && isRecord(candidate)) {
        return extractWorkspaceFromData(candidate);
      }
    }

    const sessions = data["sessions"];
    if (Array.isArray(sessions)) {
      const candidate = sessions[0];
      if (candidate && isRecord(candidate)) {
        return extractWorkspaceFromData(candidate);
      }
    }

    const workspaceRecord = data["workspace"];
    if (isRecord(workspaceRecord)) {
      return extractWorkspaceFromData(workspaceRecord);
    }

    const name = data["name"];
    const tabs = data["tabs"];
    const timestamp = data["timestamp"];
    const activeTabId = data["activeTabId"];

    if (typeof name === "string" && Array.isArray(tabs)) {
      return {
        name,
        tabs: tabs as Workspace["tabs"],
        timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
        activeTabId: typeof activeTabId === "string" ? activeTabId : undefined,
      };
    }
  }

  return null;
}

async function importWorkspaceFromFile(filePath: string): Promise<Workspace[]> {
  try {
    await ensureConduitDirectory();
    const contents = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(contents) as unknown;

    const extracted = extractWorkspaceFromData(parsed);
    if (!extracted) {
      throw new Error("Selected file does not contain a valid workspace");
    }

    const workspace: Workspace = {
      ...extracted,
      timestamp: Date.now(),
    };

    const workspacesFile = await loadWorkspacesFile();
    workspacesFile.workspaces = workspacesFile.workspaces.filter(
      (existing) => existing.name !== workspace.name,
    );
    workspacesFile.workspaces.unshift(workspace);
    workspacesFile.workspaces = workspacesFile.workspaces.slice(0, 10);

    await saveWorkspacesFile(workspacesFile);
    return workspacesFile.workspaces;
  } catch (error) {
    console.error("Failed to import workspace:", error);
    throw error;
  }
}

async function exportWorkspaceToFile(
  filePath: string,
  workspace: Workspace,
): Promise<void> {
  try {
    await fs.writeFile(filePath, JSON.stringify(workspace, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to export workspace:", error);
    throw error;
  }
}

export function initializeWorkspaceHandlers(
  refreshApplicationMenu: () => Promise<void>,
): never;
export function initializeWorkspaceHandlers(
  refreshApplicationMenu: () => Promise<void>,
  window: BrowserWindow,
): void;
export function initializeWorkspaceHandlers(
  refreshApplicationMenu: () => Promise<void>,
  window?: BrowserWindow,
) {
  if (!window) {
    throw new Error("BrowserWindow instance required");
  }

  ipcMain.handle("workspace:has-workspaces", async () => {
    return await hasWorkspaces();
  });

  ipcMain.handle("workspace:load-workspaces", async () => {
    return await loadWorkspaces();
  });

  ipcMain.handle(
    "workspace:save-workspace",
    async (_event, name, tabs, activeTabId) => {
      const terminalSessions = getAllTerminals();
      const result = await saveWorkspaceSnapshot(
        name,
        tabs,
        activeTabId,
        terminalSessions,
      );
      await refreshApplicationMenu();

      return result;
    },
  );

  ipcMain.handle("workspace:delete-workspace", async (_event, timestamp) => {
    await deleteWorkspaceByTimestamp(timestamp);
    await refreshApplicationMenu();
  });

  ipcMain.handle(
    "workspace:rename-workspace",
    async (_event, currentName, newName) => {
      const result = await renameWorkspace(currentName, newName);
      await refreshApplicationMenu();

      return result;
    },
  );

  ipcMain.handle("workspace:has-last-workspace", async () => {
    return await hasLastWorkspace();
  });

  ipcMain.handle("workspace:load-last-workspace", async () => {
    return await loadLastWorkspace();
  });

  ipcMain.handle(
    "workspace:save-last-workspace",
    async (_event, tabs, activeTabId) => {
      const terminalSessions = getAllTerminals();
      await saveLastWorkspace(tabs, activeTabId, terminalSessions);
    },
  );

  ipcMain.handle("workspace:import", async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const workspaces = await importWorkspaceFromFile(result.filePaths[0]);
    await refreshApplicationMenu();

    return workspaces;
  });

  ipcMain.handle("workspace:export", async (_event, workspace: Workspace) => {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: `${workspace.name || "workspace"}.json`,
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await exportWorkspaceToFile(result.filePath, workspace);
    return result.filePath;
  });
}
