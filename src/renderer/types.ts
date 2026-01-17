import type {
  EditorTreeMode,
  Identifiable,
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  NotificationKind,
  BrowserPane as SharedBrowserPane,
  CanvasPane as SharedCanvasPane,
  EditorPane as SharedEditorPane,
  TerminalPane as SharedTerminalPane,
  SplitDirection,
  TabMetadata,
} from "@shared/types";

export type {
  EditorTreeMode,
  Identifiable,
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  NotificationKind,
  SplitDirection,
  TabMetadata,
};

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
    title: string;
    sandboxId?: string;
  };

export type BrowserPane = Omit<SharedBrowserPane, "url"> & {
  url: string;
  title?: string;
};

export type EditorPane = Omit<SharedEditorPane, "cwd"> &
  AgentPaneMetadata & {
    cwd: string;
    sandboxId?: string;
  };

export type CanvasPane = SharedCanvasPane;

export type Pane = TerminalPane | BrowserPane | EditorPane | CanvasPane;

export type Tab = TabMetadata & {
  panes: Record<string, Pane>;
  layout: LayoutNode;
  activePaneId: string;
} & Identifiable;

/* Command palette types */

export type Command = {
  label: string;
  description?: string;
  category?: string;
  keybinding?: string;
  run: () => Promise<void> | void;
} & Identifiable;

/* Notification types */

export type NotificationAction = {
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
