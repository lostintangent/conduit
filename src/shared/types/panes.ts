/**
 * Shared pane types used across Workspace, WorkspaceTemplate, and renderer.
 */

export type PaneType = "terminal" | "browser" | "editor" | "canvas";

export type TerminalPane = {
  id: string;
  type: "terminal";
  cwd?: string | null;
  command?: string | null;
  cloneOf?: string;
  // The PTY's size when the workspace was saved
  cols?: number;
  rows?: number;
};

export type BrowserPane = {
  id: string;
  type: "browser";
  url?: string;
  devToolsFor?: string;
  chromeless?: boolean;
};

export type EditorTreeMode = "all" | "changes";
export type ChangesViewMode = "flat" | "nested";

export type EditorPane = {
  id: string;
  type: "editor";
  cwd?: string | null;
  file?: string;
  treeMode?: EditorTreeMode;
  changesViewMode?: ChangesViewMode;
  preview?: boolean;
};

export type CanvasPane = {
  id: string;
  type: "canvas";
  title?: string;
  lastSavedPath?: string;
};

export type Pane = TerminalPane | BrowserPane | EditorPane | CanvasPane;

/**
 * Common tab metadata shared across workspace, template, and renderer types.
 */
export type TabMetadata = {
  name?: string;
  locked?: boolean;
  synchronized?: boolean;
};
