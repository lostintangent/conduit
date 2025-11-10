import type { VMMetadata } from "@shared/types";

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
  vmMetadata?: VMMetadata;
  agentSessionId?: string;
  agentBranchName?: string;
  agentBaseBranch?: string | null;
  agentRepoRoot?: string;
  agentWorktreePath?: string;
} & Identifiable;

export type WebViewPane = {
  type: "webview";
  url: string;
  title?: string;
} & Identifiable;

export type EditorPane = {
  type: "editor";
  cwd: string;
  filePath?: string;
  agentSessionId?: string;
  agentBranchName?: string;
  agentBaseBranch?: string | null;
  agentRepoRoot?: string;
  agentWorktreePath?: string;
} & Identifiable;

export type Pane = TerminalPane | WebViewPane | EditorPane;

export type Tab = {
  panes: Record<string, Pane>;
  layout: LayoutNode;

  activePaneId: string;

  title?: string;
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

export type NotificationKind = "info" | "success" | "error";

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
