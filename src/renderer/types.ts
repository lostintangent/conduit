import type {
  EditorTreeMode,
  Identifiable,
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  NotificationKind,
  BrowserPane as SharedBrowserPane,
  EditorPane as SharedEditorPane,
  TerminalPane as SharedTerminalPane,
  SplitDirection,
  TabMetadata,
  VMMetadata,
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
  VMMetadata,
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
    processTitle: string;
    vmMetadata?: VMMetadata;
  };

export type BrowserPane = Omit<SharedBrowserPane, "url"> & {
  url: string;
  title?: string;
};

export type EditorPane = Omit<SharedEditorPane, "cwd"> &
  AgentPaneMetadata & {
    cwd: string;
  };

export type Pane = TerminalPane | BrowserPane | EditorPane;

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
