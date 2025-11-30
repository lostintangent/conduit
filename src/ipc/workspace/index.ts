import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tab } from "../../renderer/types";
import type { Workspace, WorkspaceState } from "../../shared/types";
import { captureTerminalCommand } from "../terminal/command";
import { getAllTerminals } from "../terminal/store";
import type { TerminalInstance } from "../terminal/types";

const WORKSPACES_FILE_NAME = "workspaces.json";

let workspacesFilePath: string;
let workspaceState: WorkspaceState = { workspaces: [] };

export default async function (
  conduitStateDirectory: string,
  refreshApplicationMenu: () => Promise<void>,
) {
  // Initialize the workspace state
  workspacesFilePath = path.join(conduitStateDirectory, WORKSPACES_FILE_NAME);
  await loadWorkspaceState();

  // Setup IPC handlers for workspace operations
  ipcMain.handle("workspace:get-state", () => workspaceState);

  ipcMain.handle(
    "workspace:save-workspace",
    async (_, name, tabs, activeTabId) => {
      const updatedState = await saveWorkspace(name, tabs, activeTabId);

      await refreshApplicationMenu();
      return updatedState;
    },
  );

  ipcMain.handle("workspace:delete-workspace", async (_, name) => {
    const updatedState = await deleteWorkspace(name);
    await refreshApplicationMenu();

    return updatedState;
  });

  ipcMain.handle(
    "workspace:rename-workspace",
    async (_, currentName, newName) => {
      const updatedState = await renameWorkspace(currentName, newName);
      await refreshApplicationMenu();

      return updatedState;
    },
  );

  ipcMain.handle(
    "workspace:save-last-workspace",
    async (_, tabs, activeTabId) => {
      return await saveLastWorkspace(tabs, activeTabId);
    },
  );
}

/* Load/save workspace state from/to disk */

async function loadWorkspaceState(): Promise<void> {
  try {
    const data = await fs.readFile(workspacesFilePath, "utf-8");
    workspaceState = JSON.parse(data) as WorkspaceState;
  } catch (error) {
    // The workspace state is already initialized to an empty state,
    // so if the file doesn't exist or fails to read, we can safely ignore the error.
  }
}

async function saveWorkspaceState(): Promise<void> {
  return fs.writeFile(
    workspacesFilePath,
    JSON.stringify(workspaceState, null, 2),
    "utf-8",
  );
}

type TabPane = Tab["panes"][string];
type SerializedTab = Workspace["tabs"][number];
type SerializedPane = SerializedTab["panes"][number];

async function serializePane(
  pane: TabPane,
  terminalSessions: Map<string, TerminalInstance>,
): Promise<SerializedPane> {
  if (pane.type === "terminal" && !pane.sourcePaneId) {
    const terminalSession = terminalSessions.get(pane.sessionId);
    const capturedCommand = terminalSession
      ? await captureTerminalCommand(terminalSession)
      : null;

    return {
      ...pane,
      command: capturedCommand,
    };
  }

  return pane;
}

async function serializeTabs(tabs: Tab[]): Promise<Workspace["tabs"]> {
  const terminalSessions = getAllTerminals();

  return Promise.all(
    tabs.map(async (tab) => {
      const panes = await Promise.all(
        Object.values(tab.panes).map((pane) =>
          serializePane(pane, terminalSessions),
        ),
      );

      return {
        ...tab,
        panes,
      };
    }),
  );
}

export async function saveWorkspace(
  name: string,
  tabs: Tab[],
  activeTabId: string | undefined,
): Promise<WorkspaceState> {
  try {
    const serializedTabs = await serializeTabs(tabs);
    const newWorkspace: Workspace = {
      name,
      lastModified: Date.now(),
      tabs: serializedTabs,
      activeTabId,
    };

    // Remove existing workspace with the same name if it exists
    workspaceState.workspaces = workspaceState.workspaces.filter(
      (s) => s.name !== name,
    );

    // Add new/updated workspace to the beginning
    workspaceState.workspaces.unshift(newWorkspace);
    await saveWorkspaceState();

    return workspaceState;
  } catch (error) {
    console.error("Failed to save workspace:", error);
  }
}

async function deleteWorkspace(name: string): Promise<void> {
  try {
    workspaceState.workspaces = workspaceState.workspaces.filter(
      (workspace) => workspace.name !== name,
    );

    await saveWorkspaceState();
  } catch (error) {
    console.error("Failed to delete workspace:", error);
  }
}

async function saveLastWorkspace(
  tabs: Tab[],
  activeTabId: string | undefined,
): Promise<WorkspaceState> {
  try {
    const serializedTabs = await serializeTabs(tabs);

    const lastWorkspace: Workspace = {
      name: "__last_workspace__",
      lastModified: Date.now(),
      tabs: serializedTabs,
      activeTabId,
    };

    workspaceState.lastWorkspace = lastWorkspace;

    await saveWorkspaceState();
    console.log("[Workspace Save] Last workspace saved successfully");
    return workspaceState;
  } catch (error) {
    console.error("Failed to save last workspace:", error);
    throw error;
  }
}

async function renameWorkspace(
  currentName: string,
  newName: string,
): Promise<WorkspaceState> {
  try {
    // Prevent renaming the special last workspace
    if (currentName === "__last_workspace__") {
      throw new Error("Cannot rename the last workspace");
    }

    const workspace = workspaceState.workspaces.find(
      (s) => s.name === currentName,
    );

    if (!workspace) {
      throw new Error(`Workspace "${currentName}" not found`);
    }

    // Check if new name already exists
    const existingWithNewName = workspaceState.workspaces.find(
      (s) => s.name === newName,
    );
    if (existingWithNewName) {
      throw new Error(`Workspace "${newName}" already exists`);
    }

    // Update the workspace name
    workspace.name = newName;

    await saveWorkspaceState();
    return workspaceState;
  } catch (error) {
    console.error("Failed to rename workspace:", error);
  }
}

export function getWorkspaces(): Workspace[] {
  return workspaceState.workspaces;
}
