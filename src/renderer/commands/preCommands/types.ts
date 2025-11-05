import type { AgentSessionInfo, CloudTerminalOptions, TerminalCreateOptions } from "@shared/types";

/**
 * Options that can be passed to splitPane function
 * Matches the SplitPaneOptions type from pane.ts
 */
export type SplitPaneOptions = {
  terminalOptions?: TerminalCreateOptions;
  agentSession?: AgentSessionInfo;
};

/**
 * Result returned by a pre-command execution
 */
export interface PreCommandResult {
  /** Whether the pre-command succeeded */
  success: boolean;

  /** Optional pane options to merge into terminal creation */
  paneOptions?: Partial<SplitPaneOptions>;

  /** Error message if success is false */
  error?: string;
}

/**
 * A pre-command definition
 * Pre-commands are lightweight handlers that execute before terminal pane creation
 */
export interface PreCommand {
  /** Unique identifier */
  id: string;

  /** Display name for dropdown UI */
  label: string;

  /** Description shown in tooltip/help text */
  description?: string;

  /** Handler function - receives current terminal config */
  run: (terminalConfig: TerminalConfig) => Promise<PreCommandResult>;
}

/**
 * Terminal configuration from pane action
 * Used as input to pre-command handlers
 */
export interface TerminalConfig extends CloudTerminalOptions {
  command: string;
  cwd?: string;
  preCommandId?: string;
}
