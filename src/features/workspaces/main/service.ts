import { app, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import type { Tab } from "@/types";
import type { Workspace, WorkspaceState } from "@shared/types";
import { captureTerminalCommand } from "@features/terminal/main/command";
import { getAllTerminals } from "@features/terminal/main/store";
import type { TerminalInstance } from "@features/terminal/main/types";
import { refreshApplicationMenu } from "../../../ipc/ui";
import { convertWorkspaceToTemplate } from "./template/export";
import { convertTemplateToWorkspace } from "./template/import";
import type { WorkspaceTemplate } from "./template/types";

const WORKSPACE_FILE_FILTER = {
  name: "Conduit Workspace",
  extensions: ["yaml", "yml"],
};

const service = {
  getState: () => workspaceState,
  saveWorkspace: refreshingMenu(saveWorkspace),
  deleteWorkspace: refreshingMenu(deleteWorkspace),
  renameWorkspace: refreshingMenu(renameWorkspace),
  saveLastWorkspace,
  importFromFile: importWorkspace,
  exportToFile: exportWorkspaceToFile,
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    workspaces: typeof service;
  }
}

/** The application menu lists workspaces, so changing them refreshes it. */
function refreshingMenu<Args extends unknown[], Result>(
  change: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args) => {
    const result = await change(...args);
    await refreshApplicationMenu();
    return result;
  };
}

let workspaceState: WorkspaceState = { workspaces: [] };
// Without a defaultPath, open dialogs start in Downloads (Electron 43+)
let lastImportDirectory: string | undefined;

const workspacesFilePath = () =>
  path.join(app.getPath("home"), ".conduit", "workspaces.json");

/* Load/save workspace state from/to disk */

export async function loadWorkspaceState(): Promise<void> {
  try {
    const data = await fs.readFile(workspacesFilePath(), "utf-8");
    workspaceState = JSON.parse(data) as WorkspaceState;
  } catch {
    // The workspace state is already initialized to an empty state,
    // so if the file doesn't exist or fails to read, we can safely ignore the error.
  }
}

async function saveWorkspaceState(): Promise<void> {
  return fs.writeFile(
    workspacesFilePath(),
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
  if (pane.type === "terminal" && !pane.cloneOf) {
    const terminalSession = terminalSessions.get(pane.sessionId);
    const capturedCommand = terminalSession
      ? await captureTerminalCommand(terminalSession)
      : null;

    return {
      ...pane,
      command: capturedCommand,
      cols: terminalSession?.pty.cols,
      rows: terminalSession?.pty.rows,
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

/** Adds or updates a workspace in the state and persists it */
async function addWorkspaceToState(workspace: Workspace): Promise<void> {
  workspaceState.workspaces = workspaceState.workspaces.filter(
    (w) => w.name !== workspace.name,
  );
  workspaceState.workspaces.unshift(workspace);
  await saveWorkspaceState();
}

async function saveWorkspace(
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

    await addWorkspaceToState(newWorkspace);

    return workspaceState;
  } catch (error) {
    console.error("Failed to save workspace:", error);
    throw error;
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
    throw error;
  }
}

export function getWorkspaces(): Workspace[] {
  return workspaceState.workspaces;
}

async function importWorkspace(): Promise<Workspace | null> {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      defaultPath: lastImportDirectory ?? app.getPath("home"),
      properties: ["openFile"],
      filters: [WORKSPACE_FILE_FILTER],
    });

    if (filePaths.length === 0) {
      return null;
    }

    const filePath = filePaths[0];
    const fileDir = path.dirname(filePath);
    lastImportDirectory = fileDir;
    const fileContent = await fs.readFile(filePath, "utf-8");

    const template = yaml.parse(fileContent) as WorkspaceTemplate;

    if (!template.name || !template.tabs) {
      throw new Error("Invalid workspace file: missing name or tabs");
    }

    const workspace = convertTemplateToWorkspace(template, fileDir);
    await addWorkspaceToState(workspace);

    return workspace;
  } catch (error) {
    console.error("Failed to import workspace:", error);
    throw error;
  }
}

async function exportWorkspaceToFile(workspace: Workspace): Promise<void> {
  try {
    const template = convertWorkspaceToTemplate(workspace);
    const yamlContent = yaml.stringify(template);

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `${workspace.name}.yaml`,
      filters: [WORKSPACE_FILE_FILTER],
    });

    if (!filePath) {
      return;
    }

    await fs.writeFile(filePath, yamlContent, "utf-8");
  } catch (error) {
    console.error("Failed to export workspace:", error);
    throw error;
  }
}
