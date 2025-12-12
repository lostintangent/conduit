/**
 * Shared pane types used across Workspace, WorkspaceTemplate, and renderer.
 */

export type PaneType = "terminal" | "browser" | "editor";

export type TerminalPane = {
  id: string;
  type: "terminal";
  cwd?: string | null;
  command?: string | null;
  cloneOf?: string;
};

export type BrowserPane = {
  id: string;
  type: "browser";
  url?: string;
  devToolsFor?: string;
};

export type EditorTreeMode = "all" | "changes";

export type EditorPane = {
  id: string;
  type: "editor";
  cwd?: string | null;
  file?: string;
  treeMode?: EditorTreeMode;
  vmId?: string;
};

export type Pane = TerminalPane | BrowserPane | EditorPane;

/**
 * Common tab metadata shared across workspace, template, and renderer types.
 */
export type TabMetadata = {
  name?: string;
  locked?: boolean;
  synchronized?: boolean;
};
