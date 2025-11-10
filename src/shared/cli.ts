export const CLI_COMMAND_NAME = "conduit";

/* CLI -> IPC -> Renderer */

export type CliRequest = {
  requestId: string;
  sessionId: string;
  command: CliCommand;
};

type Command<
  Type extends string,
  Data extends object = Record<string, never>,
> = {
  type: Type;
} & Data;

export type CliCommand =
  | CliOpenFileCommand
  | CliListPanesCommand
  | CliReadTerminalCommand
  | CliWriteTerminalCommand
  | CliCaptureBrowserCommand
  | CliMovePaneCommand
  | CliSplitPaneCommand
  | CliClosePaneCommand
  | Command<"focus-pane">
  | Command<"new-tab">
  | Command<"duplicate-tab">;

type CliOpenFileCommand = Command<
  "open-file",
  {
    filePath: string | null;
    cwd: string;
  }
>;

export const PANE_TYPES = ["editor", "browser", "terminal", "all"] as const;
export type PaneType = (typeof PANE_TYPES)[number];
type CliListPanesCommand = Command<
  "list-panes",
  {
    paneType: PaneType;
  }
>;

type CliReadTerminalCommand = Command<
  "read-terminal",
  {
    sessionId: string;
  }
>;

type CliWriteTerminalCommand = Command<
  "write-terminal",
  {
    sessionId: string;
    input: string;
  }
>;

type CliCaptureBrowserCommand = Command<
  "capture-browser",
  {
    paneId: string;
  }
>;

export const PANE_MOVE_TARGETS = [
  "left",
  "right",
  "up",
  "down",
  "tab",
] as const;
export type PaneMoveTarget = (typeof PANE_MOVE_TARGETS)[number];
type CliMovePaneCommand = Command<
  "move-pane",
  {
    direction: PaneMoveTarget;
  }
>;

export const PANE_SPLIT_TARGETS = ["left", "right", "top", "bottom"] as const;
export type PaneSplitTarget = (typeof PANE_SPLIT_TARGETS)[number];
type CliSplitPaneCommand = Command<
  "split-pane",
  {
    direction: PaneSplitTarget;
  }
>;

type CliClosePaneCommand = Command<
  "close-pane",
  {
    closeTab?: boolean;
  }
>;

/* Renderer -> IPC -> CLI */

export type CliResponse = {
  requestId: string;
  status: "ok" | "error";
  data?: any;
  message?: string;
};
