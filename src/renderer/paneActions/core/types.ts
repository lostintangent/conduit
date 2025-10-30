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

  /**
   * Optional environment variables to set
   * Completely replaces parent environment (not merged)
   */
  env?: Record<string, string>;

  /**
   * Whether to clear the terminal before executing the command
   */
  clear?: boolean;
}

/**
 * Editor pane configuration
 */
export interface EditorConfig {
  /**
   * Path to file or directory to open
   */
  path?: string;

  /**
   * Optional glob pattern for files to show (if path is a directory)
   */
  filePattern?: string;

  /**
   * Whether to reveal the file in the file tree
   */
  revealInTree?: boolean;

  /**
   * Optional line number to jump to (if opening a file)
   */
  lineNumber?: number;
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
 * Action override for specific directory paths
 */
export interface ActionOverride {
  /**
   * Directory path to match against current working directory
   * Uses prefix matching (e.g., "~/Projects" matches "~/Projects/test")
   */
  path: string;

  /**
   * Optional pane type override
   */
  paneType?: PaneType;

  /**
   * Configuration for this override
   * Completely replaces parent config (no merging)
   */
  config: PaneConfig;
}

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
   * Default pane type for this action
   */
  paneType: PaneType;

  /**
   * Default configuration (used when no override matches)
   */
  config: PaneConfig;

  /**
   * Location-specific overrides (optional)
   */
  overrides?: ActionOverride[];
}

/**
 * Root configuration structure (array of actions)
 */
export type PaneActionsConfig = Action[];

/**
 * Resolved action configuration (after override resolution)
 */
export interface ResolvedActionConfig {
  paneType: PaneType;
  config: PaneConfig;
}
