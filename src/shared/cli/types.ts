import { Pane } from "@/types";
import type { NewTabOptions } from "@shared/types";
import type {
  BrowserCaptureArgs,
  BrowserClickArgs,
  BrowserElementDescriptor,
  BrowserFocusArgs,
  BrowserHoverArgs,
  BrowserKeysArgs,
  BrowserQueryArgs,
  BrowserScrollArgs,
  BrowserTypeArgs,
  BrowserWaitArgs,
} from "./browser";

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

export const PANE_TYPES = [
  "editor",
  "browser",
  "terminal",
  "canvas",
  "all",
] as const;
export type PaneType = (typeof PANE_TYPES)[number];

export const PANE_SPLIT_TYPES = [
  "editor",
  "browser",
  "terminal",
  "canvas",
] as const;
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
  | DefineCommand<"pane-list", { paneType: PaneType }, Pane[]>
  | DefineCommand<"pane-move", { direction: PaneMoveTarget }>
  | DefineCommand<
      "pane-split",
      { direction: PaneSplitTarget; paneType: PaneSplitType }
    >
  | DefineCommand<"pane-close", { closeTab: boolean; paneId?: string }>
  | DefineCommand<"pane-focus">
  // Tab commands
  | DefineCommand<"tab-new", NewTabOptions>
  | DefineCommand<"tab-duplicate">
  | DefineCommand<"tab-lock">
  | DefineCommand<"tab-synchronize">
  // Terminal commands
  | DefineCommand<"terminal-read", { paneId?: string; all?: boolean }, string>
  | DefineCommand<
      "terminal-write",
      { paneId?: string; all?: boolean; input: string; enter?: boolean }
    >
  | DefineCommand<
      "terminal-wait",
      { paneId?: string; timeout?: number },
      boolean
    >
  // Browser commands
  | DefineCommand<"browser-capture", BrowserCaptureArgs, string>
  | DefineCommand<"browser-navigate", { paneId?: string; url: string }>
  | DefineCommand<"browser-back", { paneId?: string }>
  | DefineCommand<"browser-forward", { paneId?: string }>
  | DefineCommand<"browser-refresh", { paneId?: string }>
  | DefineCommand<"browser-query", BrowserQueryArgs, BrowserElementDescriptor[]>
  | DefineCommand<"browser-click", BrowserClickArgs>
  | DefineCommand<"browser-hover", BrowserHoverArgs>
  | DefineCommand<"browser-focus", BrowserFocusArgs>
  | DefineCommand<"browser-type", BrowserTypeArgs>
  | DefineCommand<"browser-keys", BrowserKeysArgs>
  | DefineCommand<"browser-scroll", BrowserScrollArgs>
  | DefineCommand<"browser-wait", BrowserWaitArgs>
  // Editor commands
  | DefineCommand<"editor-open", { cwd: string; filePath?: string }>
  // Canvas commands
  | DefineCommand<"canvas-capture", { paneId?: string }, string>
  // Notification commands
  | DefineCommand<"notify", { message?: string }>;

/* Response types (Renderer -> IPC -> CLI) */

export type CliResponse<T = undefined> = {
  requestId: string;
  result?: T;
  error?: string;
};

/* Type utilities for extracting command args and results */

export type CliCommandArgs<Name extends CliCommand["name"]> = Extract<
  CliCommand,
  { name: Name }
>["args"];

export type CliCommandResult<Name extends CliCommand["name"]> =
  Extract<CliCommand, { name: Name }> extends DefineCommand<any, any, infer R>
    ? R
    : void;
