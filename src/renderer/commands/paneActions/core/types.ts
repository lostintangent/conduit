/**
 * Pane Actions Type Definitions
 *
 * Based on: docs/pane-actions-schema.md
 */

import type { CloudTerminalOptions } from "@shared/types";

/**
 * Supported pane types
 */
export type PaneType = "terminal" | "editor" | "browser";

/**
 * Icon identifier from lucide-react
 *
 * Recommended: 'git-branch', 'code', 'terminal', 'globe', 'bot',
 * 'container', 'database', 'package', 'server', 'test-tube',
 * 'bug', 'rocket', 'shield', 'book', 'wrench'
 */
export type IconId = string;

/**
 * Maximum number of actions allowed
 */
export const MAX_ACTIONS = 5;

/**
 * Terminal pane configuration
 */
export interface TerminalConfig extends CloudTerminalOptions {
  /**
   * Command to execute in the terminal
   */
  command: string;

  /**
   * Optional working directory for the terminal
   */
  cwd?: string;

  /**
   * Optional pre-command to run before creating the terminal
   * Pre-commands can perform setup, validation, or configuration tasks
   */
  preCommandId?: string;
}

/**
 * Editor pane configuration
 */
export interface EditorConfig {
  /**
   * Optional working directory for the editor
   */
  cwd?: string;
}

/**
 * Browser pane configuration
 */
export interface BrowserConfig {
  /**
   * URL to load in the browser pane
   */
  url: string;
}

/**
 * Union of all pane configurations
 */
export type PaneConfig = TerminalConfig | EditorConfig | BrowserConfig;

/**
 * Action definition
 */
export interface Action {
  /**
   * Display name for the action
   */
  name: string;

  /**
   * Icon identifier from lucide-react icon set
   */
  icon: IconId;

  /**
   * Whether this action is enabled (shown in UI)
   */
  enabled: boolean;

  /**
   * Pane type for this action
   */
  paneType: PaneType;

  /**
   * Configuration for this action
   */
  config: PaneConfig;
}

/**
 * Root configuration structure (array of actions)
 */
export type PaneActionsConfig = Action[];

/**
 * Type guard to check if config is TerminalConfig
 */
export function isTerminalConfig(config: PaneConfig): config is TerminalConfig {
  return "command" in config;
}

/**
 * Type guard to check if config is EditorConfig
 */
export function isEditorConfig(config: PaneConfig): config is EditorConfig {
  return !("command" in config) && !("url" in config);
}

/**
 * Type guard to check if config is BrowserConfig
 */
export function isBrowserConfig(config: PaneConfig): config is BrowserConfig {
  return "url" in config;
}
