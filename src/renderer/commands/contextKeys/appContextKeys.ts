import { ContextKey } from "./ContextKey";

/**
 * Application-level context keys for command visibility and enablement
 *
 * These context keys are used in `when` clauses to control when commands
 * appear in the command palette and when they are enabled.
 */

// ============================================================================
// Global Context Keys
// ============================================================================

/**
 * Whether a workspace is currently open
 * Used by: workspace.close, workspace.rename
 */
export const hasWorkspace = new ContextKey<boolean>("hasWorkspace", false);

/**
 * Whether a last workspace exists that can be restored
 * Used by: workspace.openLast
 */
export const hasLastWorkspace = new ContextKey<boolean>(
  "hasLastWorkspace",
  false,
);

/**
 * Number of open tabs
 * Used by: tab.close (only show when > 1)
 */
export const tabCount = new ContextKey<number>("tabCount", 1);

/**
 * Whether the targeted tab is locked
 * Used by: commands that should be disabled when a tab is locked
 */
export const tabIsLocked = new ContextKey<boolean>("tabIsLocked", false);

/**
 * Whether the active tab has an active pane
 * Used by: pane.openWebPage
 */
export const hasActivePane = new ContextKey<boolean>("hasActivePane", false);

/**
 * Whether the active tab has a custom layout
 * Used by: view.resetLayout
 */
export const hasCustomLayout = new ContextKey<boolean>(
  "hasCustomLayout",
  false,
);

// ============================================================================
// Pane-level Context Keys
// ============================================================================

/**
 * Type of the active pane ("terminal", "browser", etc.)
 * Used by: terminal commands (only show when type === "terminal")
 */
export const activePaneType = new ContextKey<string>("activePaneType", "");

export const paneIsCollapsed = new ContextKey<boolean>(
  "paneIsCollapsed",
  false,
);

export const paneCanBeCollapsed = new ContextKey<boolean>(
  "paneCanBeCollapsed",
  false,
);

/**
 * Whether the active pane is in an agent session
 * Used by: agent.mergeAndClose, agent.terminate
 */
export const isInAgentSession = new ContextKey<boolean>(
  "isInAgentSession",
  false,
);

/**
 * Whether the active pane has a current working directory
 * Used by: terminal.openInVSCode
 */
export const hasCwd = new ContextKey<boolean>("hasCwd", false);

/**
 * Whether the targeted pane's working directory is a git repository. Only the
 * tab and pane menu builders set it, for the pane they target.
 * Used by: agent split and worktree menu items (visibility)
 */
export const hasGitRepo = new ContextKey<boolean>("hasGitRepo", false);

/**
 * Whether the tab has any panes with active worktrees
 * Used by: tab cleanup commands (menu visibility)
 */
export const tabHasWorktrees = new ContextKey<boolean>(
  "tabHasWorktrees",
  false,
);

// ============================================================================
// File Tree Context Keys
// ============================================================================

/**
 * Whether a file tree item is currently focused
 * Used by: file tree context menu commands
 */
export const fileTreeItemFocused = new ContextKey<boolean>(
  "fileTreeItemFocused",
  false,
);

/**
 * Whether the focused file tree item is a file
 * Used by: "Open" command (only show for files)
 */
export const fileTreeItemIsFile = new ContextKey<boolean>(
  "fileTreeItemIsFile",
  false,
);

/**
 * The absolute path of the file tree item being acted upon
 * Set when context menu is opened or keyboard shortcut is triggered
 */
export const fileTreeTargetPath = new ContextKey<string>(
  "fileTreeTargetPath",
  "",
);

/**
 * The current working directory of the file tree
 * Used for computing relative paths
 */
export const fileTreeCwd = new ContextKey<string>("fileTreeCwd", "");

/**
 * Whether the focused file tree item is a symlink
 * Used by: fileTree.addToDotfiles (hide for symlinks)
 */
export const fileTreeItemIsSymlink = new ContextKey<boolean>(
  "fileTreeItemIsSymlink",
  false,
);

/**
 * Whether the focused file tree item is in the home directory
 * Used by: fileTree.addToDotfiles (only show for home directory files)
 */
export const fileTreeItemInHomeDirectory = new ContextKey<boolean>(
  "fileTreeItemInHomeDirectory",
  false,
);

// ============================================================================
// File Tree Changes Mode Context Keys
// ============================================================================

/**
 * Whether the file tree is in "changes" mode (showing only changed files).
 * When true, shows git-specific actions (stage/unstage/revert) instead of
 * file operations like New File/New Folder.
 * Used by: fileTree.stage, fileTree.unstage, fileTree.revert commands
 */
export const fileTreeChangesMode = new ContextKey<boolean>(
  "fileTreeChangesMode",
  false,
);

/**
 * Whether the focused file tree item is in the staged section.
 * Only relevant when fileTreeChangesMode is true.
 * Used by: fileTree.stage (hide), fileTree.unstage (show),
 *          fileTree.rename/delete (hide for staged items)
 */
export const fileTreeItemIsStaged = new ContextKey<boolean>(
  "fileTreeItemIsStaged",
  false,
);

/**
 * The map key of the file tree item being acted upon.
 * In changes mode, this may differ from the path (includes suffix for unstaged
 * entries of partially staged files).
 * Used by: fileTree.stage, fileTree.unstage, fileTree.revert commands
 */
export const fileTreeItemMapKey = new ContextKey<string>(
  "fileTreeItemMapKey",
  "",
);

// ============================================================================
// Dotfiles Context Keys
// ============================================================================

/**
 * Whether dotfiles is enabled (user has configured a dotfiles repo)
 * Used by: fileTree.addToDotfiles command visibility
 */
export const dotfilesEnabled = new ContextKey<boolean>(
  "dotfilesEnabled",
  false,
);
