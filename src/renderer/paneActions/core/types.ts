/**
 * Pane Actions Type Definitions
 *
 * Based on: docs/pane-actions-schema.md
 */

/**
 * Supported pane types
 */
export type PaneType = 'terminal' | 'editor' | 'browser';

/**
 * Icon identifier from lucide-react
 *
 * Recommended: 'git-branch', 'code', 'terminal', 'globe', 'bot',
 * 'container', 'database', 'package', 'server', 'test-tube',
 * 'bug', 'rocket', 'shield', 'book', 'wrench'
 */
export type IconId = string;

/**
 * Terminal pane configuration
 */
export interface TerminalConfig {
  /**
   * Command to execute in the terminal
   */
  command: string;

  /**
   * Optional working directory override
   */
  cwd?: string;
}

/**
 * Editor pane configuration
 */
export interface EditorConfig {
  /**
   * Optional folder path to open in the editor
   * Maps to the editor pane's cwd (working directory)
   */
  folderPath?: string;
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
