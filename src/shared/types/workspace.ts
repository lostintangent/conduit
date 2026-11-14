import type { LayoutNode } from "./layout";
import type { Pane, TabMetadata } from "./panes";

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

export type NewTabOptions = {
  command?: string;
  title?: string;
};
