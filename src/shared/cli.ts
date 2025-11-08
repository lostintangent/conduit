export const CLI_COMMAND_NAME = "conduit";

/* CLI -> IPC -> Renderer */

export type CliRequest = {
  sessionId: string;
  requestId: string;
  command: CliCommand;
};

export type CliCommand =
  | CliOpenFileCommand
  | CliGetPanesCommand
  | CliReadTerminalCommand
  | CliCaptureBrowserCommand
  | CliWriteTerminalCommand
  | CliMovePaneCommand;

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

export type CliOpenFileCommand = {
  type: "open-file";
  filePath: string | null;
  cwd: string;
};

export const PANE_TYPES = ["editor", "browser", "terminal", "all"] as const;
export type PaneType = (typeof PANE_TYPES)[number];
export type CliGetPanesCommand = {
  type: "list-panes";
  paneType: PaneType;
};

export type CliReadTerminalCommand = {
  type: "read-terminal";
  sessionId: string;
};

export type CliCaptureBrowserCommand = {
  type: "capture-browser";
  paneId: string;
};

export type CliWriteTerminalCommand = {
  type: "write-terminal";
  sessionId: string;
  input: string;
};

/* Renderer -> IPC -> CLI */

export type CliResponse = {
  requestId: string;
  status: "ok" | "error";
  message?: string;
  data?: any;
};
