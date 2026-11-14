import type { BackgroundCommandRequest } from "@features/terminal/model";
import type { Workspace } from "@features/workspaces/model";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import type { ContextMenuOptions } from "@shared/commands";
import type { FeatureApis } from "@shared/rpc";
import { contextBridge, ipcRenderer } from "electron";
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

  showContextMenu: (options: ContextMenuOptions) =>
    ipcRenderer.send("ui:show-context-menu", options),

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

  cli: {
    onRequest: (listener: (request: CliRequest) => void) =>
      createEventListener("cli:request", listener),

    respondToRequest: <T>(response: CliResponse<T>) =>
      ipcRenderer.invoke("cli:respond", response) as Promise<void>,
  },
};

export type ConduitAPI = typeof conduitAPI & FeatureApis;

contextBridge.exposeInMainWorld("conduit", {
  ...conduitAPI,
  ...createFeatureApis(),
});
