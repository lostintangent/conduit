import { app, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import type { Tab } from "@features/workbench/model";
import type { SidebarPage } from "@features/browser/model";
import type { BrowserNavigation } from "@shared/types/panes";
import {
  timestampedName,
  type UntitledWorkspace,
  type Workspace,
  type WorkspaceState,
} from "../model";
import { restoreOnAttach } from "@features/browser/main/restore";
import { serializeBrowserPane } from "@features/browser/main/serialize";
import { serializeTerminalPane } from "@features/terminal/main/serialize";
import { writeJsonFile } from "../../../main/atomicWrite";
import { refreshApplicationMenu } from "../../../main/ui/applicationMenu";
import { convertWorkspaceToTemplate } from "./template/export";
import { convertTemplateToWorkspace } from "./template/import";
import type { WorkspaceTemplate } from "./template/types";

const WORKSPACE_FILE_FILTER = {
  name: "Conduit Workspace",
  extensions: ["yaml", "yml"],
};

const service = {
  getState: () => forWindow(workspaceState),
  saveWorkspace: inOrder(saveWorkspace),
  saveWorkspaceAs: inOrder(saveWorkspaceAs),
  setCurrentWorkspace: inOrder(setCurrentWorkspace),
  recoverLastSession: inOrder(recoverLastSession),
  stagePages: inOrder(stagePages),
  deleteWorkspace: inOrder(deleteWorkspace),
  renameWorkspace: inOrder(renameWorkspace),
  importFromFile: importWorkspace,
  exportToFile: exportWorkspaceToFile,
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    workspaces: typeof service;
  }
}

// Changes run one at a time, in the order they were asked for, so a save
// that's slow to capture its terminals can't land after a newer one.
let changes: Promise<unknown> = Promise.resolve();
function inOrder<Args extends unknown[], Result>(
  change: (...args: Args) => Promise<Result>,
) {
  return (...args: Args): Promise<Result> => {
    const result = changes.then(() => change(...args));
    changes = result.catch(() => undefined);
    return result;
  };
}

let workspaceState: WorkspaceState = { workspaces: [] };
/** The names the File menu lists, so a save that keeps them doesn't rebuild it. */
let listedNames = "";
// Without a defaultPath, open dialogs start in Downloads (Electron 43+)
let lastImportDirectory: string | undefined;

const workspacesFilePath = () =>
  path.join(app.getPath("home"), ".conduit", "workspaces.json");

/* Load/save workspace state from/to disk */

export async function loadWorkspaceState(): Promise<void> {
  const filePath = workspacesFilePath();
  let data: string;
  try {
    data = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[Workspaces] Couldn't read workspaces.json:", error);
    }
    return;
  }

  try {
    workspaceState = migrate(parseWorkspaceState(data));
    listedNames = JSON.stringify(workspaceState.workspaces.map((w) => w.name));
  } catch (error) {
    // The next save would replace it, and every workspace in it with it
    const aside = `${filePath}.corrupt-${Date.now()}`;
    await fs.rename(filePath, aside);
    workspaceState = { workspaces: [] };
    console.error(
      `[Workspaces] Moved workspaces.json to ${path.basename(aside)}, since ${(error as Error).message}`,
    );
  }
}

function parseWorkspaceState(data: string): WorkspaceState {
  let state: unknown;
  try {
    state = JSON.parse(data);
  } catch (error) {
    throw new Error(`it doesn't parse: ${(error as Error).message}`);
  }
  if (!Array.isArray((state as WorkspaceState | null)?.workspaces)) {
    throw new Error("it doesn't hold a list of workspaces");
  }
  return state as WorkspaceState;
}

/**
 * Before the anonymous workspace, the tabs open at close were saved as
 * `lastWorkspace`, and reopening them leaked copies named after it into the
 * list.
 */
const LAST_WORKSPACE = "__last_workspace__";
function migrate(
  state: WorkspaceState & { lastWorkspace?: Workspace },
): WorkspaceState {
  const { lastWorkspace, ...migrated } = state;
  migrated.workspaces = migrated.workspaces.filter(
    ({ name }) => name !== LAST_WORKSPACE,
  );
  if (lastWorkspace && !migrated.untitled) {
    const { name: _name, ...untitled } = lastWorkspace;
    migrated.untitled = untitled;
  }
  if (!findWorkspace(migrated, migrated.current)) delete migrated.current;
  return migrated;
}

function findWorkspace(state: WorkspaceState, name: string | undefined) {
  return state.workspaces.find((workspace) => workspace.name === name);
}

async function saveWorkspaceState(): Promise<WorkspaceState> {
  await writeJsonFile(workspacesFilePath(), workspaceState);
  const names = JSON.stringify(workspaceState.workspaces.map((w) => w.name));
  if (names !== listedNames) {
    listedNames = names;
    await refreshApplicationMenu();
  }
  return forWindow(workspaceState);
}

/**
 * The state as the window has it, without its pages' back/forward history,
 * which only main restores, and which can be large. Workspace files can be
 * edited by hand, so it doesn't count on their shape.
 */
function forWindow(state: WorkspaceState): WorkspaceState {
  return JSON.parse(
    JSON.stringify(state, (key, value) =>
      key === "navigation" ? undefined : value,
    ),
  );
}

/** A workspace's pages' back/forward history, by pane */
function savedNavigation(workspace: UntitledWorkspace | undefined) {
  const pages = new Map<string, BrowserNavigation>();
  for (const tab of workspace?.tabs ?? []) {
    for (const pane of tab.panes ?? []) {
      if (pane.type === "browser" && pane.navigation) {
        pages.set(pane.id, pane.navigation);
      }
    }
  }
  return pages;
}

function currentWorkspace(): UntitledWorkspace | undefined {
  const { current, untitled } = workspaceState;
  return current ? findWorkspace(workspaceState, current) : untitled;
}

/**
 * Each pane as its feature saves it, without what only lasts while it runs.
 * A page that hasn't attached since it reopened keeps the history the open
 * workspace saved it with.
 */
function serializeTabs(tabs: Tab[]): Promise<Workspace["tabs"]> {
  const saved = savedNavigation(currentWorkspace());
  return Promise.all(
    tabs.map(async (tab) => ({
      ...tab,
      panes: await Promise.all(
        Object.values(tab.panes).map((pane) => {
          if (pane.type === "terminal") return serializeTerminalPane(pane);
          if (pane.type === "browser") {
            return serializeBrowserPane(pane, saved.get(pane.id));
          }
          if (pane.type === "editor") {
            // Nobody waits on a reopened editor's save
            const { closeOnSave: _closeOnSave, ...editor } = pane;
            return editor;
          }
          return pane;
        }),
      ),
    })),
  );
}

/** Adds or replaces a workspace, as the most recent one */
function putWorkspace(workspace: Workspace) {
  workspaceState.workspaces = workspaceState.workspaces.filter(
    (w) => w.name !== workspace.name,
  );
  workspaceState.workspaces.unshift(workspace);
}

/** The name, or the first of "name 2", "name 3" and so on that's free. */
function unusedName(name: string): string {
  let unused = name;
  for (let n = 2; findWorkspace(workspaceState, unused); n++) {
    unused = `${name} ${n}`;
  }
  return unused;
}

/** Saves the window's tabs and sidebar page into the open workspace. */
async function saveWorkspace(
  tabs: Tab[],
  activeTabId: string | undefined,
  sidebarPage?: SidebarPage,
): Promise<WorkspaceState> {
  const saved = {
    lastModified: Date.now(),
    tabs: await serializeTabs(tabs),
    activeTabId,
    sidebarPage,
  };
  const { current } = workspaceState;
  if (current) {
    putWorkspace({ name: current, ...saved });
  } else {
    workspaceState.untitled = saved;
  }
  return saveWorkspaceState();
}

/**
 * Saves the window's tabs and sidebar page under a name, which becomes the
 * open workspace. The anonymous workspace's tabs move into it, so it starts
 * over.
 */
async function saveWorkspaceAs(
  name: string,
  tabs: Tab[],
  activeTabId: string | undefined,
  sidebarPage?: SidebarPage,
): Promise<WorkspaceState> {
  putWorkspace({
    name,
    lastModified: Date.now(),
    tabs: await serializeTabs(tabs),
    activeTabId,
    sidebarPage,
  });
  if (!workspaceState.current) delete workspaceState.untitled;
  workspaceState.current = name;
  return saveWorkspaceState();
}

/** Opens a named workspace, or the anonymous one for `null`. */
async function setCurrentWorkspace(
  name: string | null,
): Promise<WorkspaceState> {
  if (name === null) {
    delete workspaceState.current;
  } else if (findWorkspace(workspaceState, name)) {
    workspaceState.current = name;
  } else {
    throw new Error(`Workspace "${name}" not found`);
  }
  return saveWorkspaceState();
}

/**
 * Starts the window over without its last session, which couldn't reopen.
 * The anonymous workspace's tabs move into the list as "Recovered <date,
 * time>", so the window's new tab can't autosave over them, and a named
 * workspace that was open stays in it. Resolves to the name that keeps the
 * last session, if it had tabs.
 */
async function recoverLastSession(): Promise<string | undefined> {
  const { current, untitled } = workspaceState;
  let recovered: string | undefined;
  if (untitled?.tabs.length) {
    recovered = unusedName(timestampedName("Recovered"));
    putWorkspace({ ...untitled, name: recovered });
  }
  delete workspaceState.untitled;
  delete workspaceState.current;
  await saveWorkspaceState();
  return current ?? recovered;
}

/**
 * Has the browser give a workspace's pages their back/forward history back as
 * they reopen, and resolves to those pages' panes. The anonymous workspace is
 * `null`.
 */
async function stagePages(name: string | null): Promise<string[]> {
  const pages = savedNavigation(
    name === null
      ? workspaceState.untitled
      : findWorkspace(workspaceState, name),
  );
  restoreOnAttach(pages);
  return [...pages.keys()];
}

async function deleteWorkspace(name: string): Promise<WorkspaceState> {
  // Its next autosave would bring it back
  if (name === workspaceState.current) {
    throw new Error("The open workspace can't be deleted");
  }
  workspaceState.workspaces = workspaceState.workspaces.filter(
    (workspace) => workspace.name !== name,
  );
  return saveWorkspaceState();
}

async function renameWorkspace(
  currentName: string,
  newName: string,
): Promise<WorkspaceState> {
  const workspace = findWorkspace(workspaceState, currentName);
  if (!workspace) {
    throw new Error(`Workspace "${currentName}" not found`);
  }
  if (findWorkspace(workspaceState, newName)) {
    throw new Error(`Workspace "${newName}" already exists`);
  }

  workspace.name = newName;
  if (workspaceState.current === currentName) {
    workspaceState.current = newName;
  }
  return saveWorkspaceState();
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

    return await inOrder(async () => {
      const workspace = convertTemplateToWorkspace(template, fileDir);
      // Replacing the open workspace would leave the window's tabs to
      // autosave over it
      workspace.name = unusedName(workspace.name);
      putWorkspace(workspace);
      await saveWorkspaceState();
      return workspace;
    })();
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
