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
 * Whether the active tab has an active pane
 * Used by: pane.openWebPage, terminal.createVM
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
