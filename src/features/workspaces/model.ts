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

/** The workspace you have before saving one under a name. It's never listed. */
export type UntitledWorkspace = Omit<Workspace, "name">;

/**
 * The window's tabs autosave into the open workspace, which is `untitled`
 * while `current` is absent.
 */
export type WorkspaceState = {
  workspaces: Workspace[];
  untitled?: UntitledWorkspace;
  /** The name of the open workspace. */
  current?: string;
};

/** Names a workspace after when it was saved, like "Layout Nov 15, 1:25 PM". */
export function timestampedName(prefix: string) {
  return `${prefix} ${new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
}

declare module "@shared/rpc" {
  interface Events {
    /** The name of the workspace picked from File > Open Workspace. */
    workspaces: { openRequested: string };
  }
}
