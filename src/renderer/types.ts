type Identifiable = { id: string };
type Resizable = { size?: number };

/* Layout tree types */

export type LayoutPaneNode = {
  type: "pane";
  paneId: string;
} & Identifiable &
  Resizable;

export type SplitDirection = "row" | "column";
export type LayoutSplitNode = {
  type: "split";
  direction: SplitDirection;
  children: LayoutNode[];
} & Identifiable &
  Resizable;

export type LayoutNode = LayoutPaneNode | LayoutSplitNode;

/* Tab and pane types */

export type TerminalPane = {
  type: "terminal";
  sessionId: string;
  cwd: string | null;
  processTitle: string;
} & Identifiable;

export type WebViewPane = {
  type: "webview";
  url: string;
  title?: string;
} & Identifiable;

export type Pane = TerminalPane | WebViewPane;

type TabMode = "layout" | "focus";

export type Tab = {
  panes: Record<string, Pane>;
  layout: LayoutNode;
  mode: TabMode;

  isActive: boolean;
  activePaneId: string;

  title?: string;
} & Identifiable;

/* Command palette types */

export type Command = {
  label: string;
  description?: string;
  run: () => Promise<void> | void;
} & Identifiable;
