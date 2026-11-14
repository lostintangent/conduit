import type {
  BrowserPane as SharedBrowserPane,
  CanvasPane as SharedCanvasPane,
  EditorPane as SharedEditorPane,
  TerminalPane as SharedTerminalPane,
  TabMetadata,
} from "@shared/types/panes";

/* Layout types */

type Identifiable = { id: string };
type Resizable = { size?: number };

export type LayoutPaneNode = {
  type: "pane";
  paneId: string;
  collapsed?: boolean;
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

/**
 * Runtime metadata for panes associated with an agent session.
 */
type AgentPaneMetadata = {
  agentSessionId?: string;
  agentBranchName?: string;
  agentBaseBranch?: string | null;
  agentRepoRoot?: string;
  agentWorktreePath?: string;
};

export type TerminalPane = Omit<SharedTerminalPane, "cwd"> &
  AgentPaneMetadata & {
    sessionId: string;
    cwd: string | null;
    title?: string;
  };

export type BrowserPane = Omit<SharedBrowserPane, "url"> & {
  url: string;
  title?: string;
};

export type EditorPane = Omit<SharedEditorPane, "cwd"> &
  AgentPaneMetadata & {
    cwd: string;
  };

export type CanvasPane = SharedCanvasPane;

export type Pane = TerminalPane | BrowserPane | EditorPane | CanvasPane;

export type Tab = TabMetadata & {
  panes: Record<string, Pane>;
  layout: LayoutNode;
  activePaneId: string;
} & Identifiable;

export type NewTabOptions = {
  command?: string;
  title?: string;
};

/* Hyper terminal types */

type HyperTerminalState = "visible" | "minimized";

export type HyperTerminalPosition = { x: number; y: number };

export type HyperTerminal = {
  terminalId: string;
  paneId: string;
  cwd: string | null;
  state: HyperTerminalState;
  position: HyperTerminalPosition | null;
};

/* Command palette types */

export type Command = {
  label: string;
  description?: string;
  category?: string;
  keybinding?: string;
  run: () => Promise<void> | void;
} & Identifiable;

/* Notification types */

type NotificationKind = "info" | "success" | "error";

type NotificationAction = {
  label: string;
  onClick: () => void;
};

export type Notification = {
  id: string;
  kind: NotificationKind;
  message: string;
  details?: string;
  persistent?: boolean;
  actions?: NotificationAction[];
  createdAt: number;
};
