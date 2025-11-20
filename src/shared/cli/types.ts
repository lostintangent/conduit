import { Pane } from "@/types";

export const CLI_COMMAND_NAME = "conduit";

/* Request types (CLI -> IPC -> Renderer) */

export type CliRequest = {
  requestId: string;
  sessionId: string;
  command: CliCommand;
};

export type DefineCommand<
  Name extends string,
  Args extends object = object,
  Result = void,
> = {
  name: Name;
  args?: Args;
};

export const PANE_TYPES = ["editor", "browser", "terminal", "all"] as const;
export type PaneType = (typeof PANE_TYPES)[number];

export const PANE_SPLIT_TYPES = ["editor", "browser", "terminal"] as const;
export type PaneSplitType = (typeof PANE_SPLIT_TYPES)[number];

export const PANE_MOVE_TARGETS = [
  "left",
  "right",
  "up",
  "down",
  "tab",
] as const;
export type PaneMoveTarget = (typeof PANE_MOVE_TARGETS)[number];

export const PANE_SPLIT_TARGETS = ["left", "right", "top", "bottom"] as const;
export type PaneSplitTarget = (typeof PANE_SPLIT_TARGETS)[number];

export type CliCommand =
  // Pane commands
  | DefineCommand<"list-panes", { paneType: PaneType }, Pane[]>
  | DefineCommand<"move-pane", { direction: PaneMoveTarget }>
  | DefineCommand<
      "split-pane",
      { direction: PaneSplitTarget; paneType: PaneSplitType }
    >
  | DefineCommand<"close-pane", { closeTab: boolean }>
  | DefineCommand<"focus-pane">
  // Tab commands
  | DefineCommand<"new-tab">
  | DefineCommand<"duplicate-tab">
  // Terminal commands
  | DefineCommand<"read-terminal", { sessionId: string }, string>
  | DefineCommand<"write-terminal", { sessionId: string; input: string }>
  // Browser commands
  | DefineCommand<"capture-browser", { paneId: string }, string>
  | DefineCommand<"navigate-browser", { paneId: string; url: string }>
  // Editor commands
  | DefineCommand<"open-file", { cwd: string; filePath?: string }>;

/* Response types (Renderer -> IPC -> CLI) */

export type CliResponse<T = undefined> = {
  requestId: string;
  result?: T;
  error?: string;
};
