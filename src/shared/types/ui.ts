/**
 * Shared UI types used across main, preload, and renderer processes.
 */

export type NotificationKind = "info" | "success" | "error";

export type HyperTerminalState = "visible" | "minimized";

export type HyperTerminalPosition = { x: number; y: number };

export type HyperTerminal = {
  terminalId: string;
  paneId: string;
  cwd: string | null;
  state: HyperTerminalState;
  position: HyperTerminalPosition | null;
};
