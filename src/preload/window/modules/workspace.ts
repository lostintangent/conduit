import { ipcRenderer } from "electron";
import type { Tab } from "@/types";
import type { WorkspaceState } from "../../shared/types";

export default {
  getState: () =>
    ipcRenderer.invoke("workspace:get-state") as Promise<WorkspaceState>,

  saveWorkspace: (name: string, tabs: Tab[], activeTabId: string) =>
    ipcRenderer.invoke(
      "workspace:save-workspace",
      name,
      tabs,
      activeTabId,
    ) as Promise<WorkspaceState>,

  deleteWorkspace: (name: string) =>
    ipcRenderer.invoke("workspace:delete-workspace", name) as Promise<void>,

  renameWorkspace: (currentName: string, newName: string) =>
    ipcRenderer.invoke(
      "workspace:rename-workspace",
      currentName,
      newName,
    ) as Promise<WorkspaceState>,

  saveLastWorkspace: (tabs: Tab[], activeTabId: string) =>
    ipcRenderer.invoke(
      "workspace:save-last-workspace",
      tabs,
      activeTabId,
    ) as Promise<WorkspaceState>,
};
