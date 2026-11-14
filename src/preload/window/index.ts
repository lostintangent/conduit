import type {
  AgentSessionCleanupRequest,
  AgentSessionCleanupResult,
  AgentSessionFinalizeRequest,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
  AgentSessionSpawnRequest,
  BackgroundCommandRequest,
  BrowserPage,
  UserSettings,
  Workspace,
} from "@shared/types";
import type { FeatureApis } from "@shared/rpc";
import { contextBridge, ipcRenderer } from "electron";
import configureBrowserModule from "./modules/browser";
import configureCliModule from "./modules/cli";
import fsModule from "./modules/fs";
import gitModule from "./modules/git";
import { createFeatureApis } from "./features";
import { createEventListener } from "./utils";

const conduitAPI = {
  /* UI event listeners (main->UI) */

  // Notify when user requests a new tab (e.g. via menu or keyboard shortcut)
  onNewTabRequest: (listener: () => void) =>
    createEventListener("ui:new-tab-request", listener),

  // Notify when user requests to open a workspace (e.g. via menu)
  onOpenWorkspaceRequest: (listener: (workspace: Workspace) => void) =>
    createEventListener("ui:open-workspace-request", listener),

  // Notify when the user clicks a context menu command
  onContextMenuCommand: (
    listener: (payload: {
      commandId: string;
      tabId: string;
      paneId?: string;
    }) => void,
  ) => createEventListener("ui:context-menu-command", listener),

  // Notify when the app is about to close
  onBeforeClose: (listener: () => void) =>
    createEventListener("app:before-close", listener),

  /* UI-related methods (UI->main) */

  getSettings: () =>
    ipcRenderer.invoke("ui:get-settings") as Promise<UserSettings>,

  updateSettings: (updates: Partial<UserSettings>) =>
    ipcRenderer.invoke("ui:update-settings", updates) as Promise<UserSettings>,

  showContextMenu: (options: {
    tabId: string;
    paneId?: string;
    menuItems: Array<{
      commandId: string;
      title: string;
      group: string;
      enabled: boolean;
      keybinding?: string;
    }>;
  }) => ipcRenderer.send("ui:show-context-menu", options),

  addCommandHistoryEntry: (command: string) =>
    ipcRenderer.invoke("ui:add-command-history-entry", command) as Promise<
      string[]
    >,

  removeCommandHistoryEntry: (command: string) =>
    ipcRenderer.invoke("ui:remove-command-history-entry", command) as Promise<
      string[]
    >,

  addUrlToHistory: (url: string) =>
    ipcRenderer.invoke("ui:add-url-to-history", url) as Promise<string[]>,

  removeUrlFromHistory: (url: string) =>
    ipcRenderer.invoke("ui:remove-url-from-history", url) as Promise<string[]>,

  addStarredPage: (page: BrowserPage) =>
    ipcRenderer.invoke("ui:add-starred-page", page) as Promise<BrowserPage[]>,

  removeStarredPage: (url: string) =>
    ipcRenderer.invoke("ui:remove-starred-page", url) as Promise<BrowserPage[]>,

  runBackgroundCommand: (options: BackgroundCommandRequest) =>
    ipcRenderer.invoke("ui:run-background-command", options) as Promise<void>,

  openExternal: (url: string) =>
    ipcRenderer.invoke("ui:open-url", url) as Promise<void>,

  showFolderPicker: (defaultPath?: string) =>
    ipcRenderer.invoke("ui:show-folder-picker", defaultPath) as Promise<
      string | null
    >,

  showItemInFolder: (path: string) =>
    ipcRenderer.invoke("ui:show-item-in-folder", path) as Promise<void>,

  writeClipboard: (text: string) =>
    ipcRenderer.send("ui:write-clipboard", text),

  /* Agent session management */

  spawnAgentSession: (payload: AgentSessionSpawnRequest) =>
    ipcRenderer.invoke(
      "agent:spawn-session",
      payload,
    ) as Promise<AgentSessionInfo>,

  listAgentSessions: () =>
    ipcRenderer.invoke("agent:list-sessions") as Promise<AgentSessionInfo[]>,

  hasGitRepository: (cwd: string) =>
    ipcRenderer.invoke("agent:has-git-repo", cwd) as Promise<boolean>,

  finalizeAgentSession: (payload: AgentSessionFinalizeRequest) =>
    ipcRenderer.invoke(
      "agent:finalize-session",
      payload,
    ) as Promise<AgentSessionFinalizeResult>,

  cleanupAgentSession: (payload: AgentSessionCleanupRequest) =>
    ipcRenderer.invoke(
      "agent:cleanup-session",
      payload,
    ) as Promise<AgentSessionCleanupResult>,

  /* Temporary file operations */

  writeTempFile: (content: Uint8Array, extension?: string) =>
    ipcRenderer.invoke("fs:write-temp-file", {
      content,
      extension,
    }) as Promise<string>,

  browser: configureBrowserModule,
  cli: configureCliModule,
  fs: fsModule,
  git: gitModule,
};

export type ConduitAPI = typeof conduitAPI & FeatureApis;

contextBridge.exposeInMainWorld("conduit", {
  ...conduitAPI,
  ...createFeatureApis(),
});
