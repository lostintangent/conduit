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
  // The browser pane its last link opened in, where its next link loads
  linkPane?: string;
};

export type BrowserPane = {
  id: string;
  type: "browser";
  url?: string;
  devToolsFor?: string;
  chromeless?: boolean;
  // Saved, so a reopened tab shows it before its page loads
  icon?: PageIcon;
  // Only main has it, since only main restores it
  navigation?: BrowserNavigation;
};

/** A page's icon, drawn small enough to save with its workspace */
export type PageIcon = {
  /** A 32px PNG, as a data URL */
  src: string;
  /** A single shade on a clear ground, drawn in its label's color */
  template: boolean;
};

/**
 * A page's back/forward history, as Electron's `navigationHistory` has it.
 * Each entry's `pageState` holds its scroll position and form values.
 */
export type BrowserNavigation = {
  index: number;
  entries: { url: string; title: string; pageState?: string }[];
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
