import type {
  BrowserPane as SharedBrowserPane,
  CanvasPane as SharedCanvasPane,
  EditorPane as SharedEditorPane,
  PageIcon,
  TerminalPane as SharedTerminalPane,
  TabMetadata,
} from "@shared/types/panes";
import type { ContextMenuOptions } from "@shared/commands";

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

/**
 * What a pane's label shows before it: its page's icon, or "loading" while a
 * new site's is on its way, which only lasts while the app runs
 */
export type PaneIcon = PageIcon | "loading";

export type BrowserPane = Omit<
  SharedBrowserPane,
  "url" | "navigation" | "icon"
> & {
  url: string;
  title?: string;
  icon?: PaneIcon;
  /** The page's web contents, once it attaches, which main saves its history from */
  webContentsId?: number;
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

declare module "@shared/rpc" {
  interface Events {
    workbench: {
      /** File > New Tab. */
      newTabRequested: void;
      /** The item clicked in a menu from `showContextMenu`. */
      contextMenuCommand: ContextMenuOptions & { commandId: string };
      /**
       * The window is closing once the page calls `readyToClose`, or after a
       * few seconds without it.
       */
      beforeClose: void;
    };
  }
}
