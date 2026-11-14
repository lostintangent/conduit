import type { LayoutNode } from "@features/workbench/model";
import type { Pane, TabMetadata } from "@shared/types/panes";

/**
 * A saved/serializable workspace tab.
 */
export type WorkspaceTab = TabMetadata & {
  id: string;
  panes: Pane[];
  activePaneId: string;
  layout: LayoutNode;
};

export type Workspace = {
  name: string;
  lastModified: number;
  tabs: WorkspaceTab[];
  activeTabId?: string;
};

export type WorkspaceState = {
  workspaces: Workspace[];
  lastWorkspace?: Workspace;
};

declare module "@shared/rpc" {
  interface Events {
    /** Picked from File > Open Workspace. */
    workspaces: { openRequested: Workspace };
  }
}
