export const CLI_COMMAND_NAME = "conduit";

/* CLI -> IPC -> Renderer */

export type CliRequest = {
  requestId: string;
  sessionId: string;
  command: CliCommand;
};

export type CliCommand =
  | CliOpenFileCommand
  | CliListPanesCommand
  | CliReadTerminalCommand
  | CliWriteTerminalCommand
  | CliCaptureBrowserCommand
  | CliMovePaneCommand
  | CliSplitPaneCommand
  | CliFocusPaneCommand
  | CliClosePaneCommand
  | CliNewTabCommand
  | CliDuplicateTabCommand;

export type CliOpenFileCommand = {
  type: "open-file";
  filePath: string | null;
  cwd: string;
};

export const PANE_TYPES = ["editor", "browser", "terminal", "all"] as const;
export type PaneType = (typeof PANE_TYPES)[number];
export type CliListPanesCommand = {
  type: "list-panes";
  paneType: PaneType;
};

export type CliReadTerminalCommand = {
  type: "read-terminal";
  sessionId: string;
};

export type CliWriteTerminalCommand = {
  type: "write-terminal";
  sessionId: string;
  input: string;
};

export type CliCaptureBrowserCommand = {
  type: "capture-browser";
  paneId: string;
};

export const PANE_MOVE_TARGETS = [
  "left",
  "right",
  "up",
  "down",
  "tab",
] as const;
export type PaneMoveTarget = (typeof PANE_MOVE_TARGETS)[number];
export type CliMovePaneCommand = {
  type: "move-pane";
  direction: PaneMoveTarget;
};

export const PANE_SPLIT_TARGETS = ["left", "right", "top", "bottom"] as const;
export type PaneSplitTarget = (typeof PANE_SPLIT_TARGETS)[number];
export type CliSplitPaneCommand = {
  type: "split-pane";
  direction: PaneSplitTarget;
};

export type CliFocusPaneCommand = {
  type: "focus-pane";
};

export type CliClosePaneCommand = {
  type: "close-pane";
  closeTab?: boolean;
};

export type CliNewTabCommand = {
  type: "new-tab";
};

export type CliDuplicateTabCommand = {
  type: "duplicate-tab";
};

/* Renderer -> IPC -> CLI */

export type CliResponse = {
  requestId: string;
  status: "ok" | "error";
  data?: any;
  message?: string;
};
