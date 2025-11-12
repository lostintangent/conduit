/**
 * Command IDs used throughout the application
 *
 * These constants are shared between main and renderer processes
 * to ensure type safety when referencing commands.
 */
export const ApplicationCommands = {
  // View commands
  VIEW_TOGGLE_FOCUS_MODE: "view.toggleFocusMode",
  VIEW_TOGGLE_DESIGN_MODE: "view.toggleDesignMode",
  VIEW_OPEN_KEYBOARD_SHORTCUTS: "view.openKeyboardShortcuts",
  VIEW_OPEN_PANE_ACTIONS: "view.openPaneActions",
  VIEW_SHOW_COMMAND_PALETTE: "view.showCommandPalette",
  VIEW_RESET_LAYOUT: "view.resetLayout",

  // Tab commands
  TAB_NEW: "tab.new",
  TAB_CLOSE: "tab.close",
  TAB_DUPLICATE: "tab.duplicate",
  TAB_DUPLICATE_WITH_CWD: "tab.duplicateWithCwd",
  TAB_DUPLICATE_INTO_WORKTREE: "tab.duplicateIntoWorktree",
  TAB_CHANGE_TITLE: "tab.changeTitle",
  TAB_LOCK: "tab.lock",
  TAB_UNLOCK: "tab.unlock",

  // Workspace commands
  WORKSPACE_SAVE: "workspace.save",
  WORKSPACE_RENAME: "workspace.rename",
  WORKSPACE_DUPLICATE: "workspace.duplicate",
  WORKSPACE_CLOSE: "workspace.close",
  WORKSPACE_OPEN: "workspace.open",
  WORKSPACE_OPEN_LAST: "workspace.openLast",

  // Pane commands
  PANE_OPEN_WEB_PAGE: "pane.openWebPage",
  PANE_FOCUS: "pane.focus",
  PANE_CLOSE: "pane.close",
  PANE_SPLIT_LEFT: "pane.splitLeft",
  PANE_SPLIT_RIGHT: "pane.splitRight",
  PANE_SPLIT_TOP: "pane.splitTop",
  PANE_SPLIT_BOTTOM: "pane.splitBottom",
  PANE_SPLIT_LEFT_AGENT: "pane.splitLeftAgent",
  PANE_SPLIT_RIGHT_AGENT: "pane.splitRightAgent",
  PANE_SPLIT_TOP_AGENT: "pane.splitTopAgent",
  PANE_SPLIT_BOTTOM_AGENT: "pane.splitBottomAgent",
  PANE_MOVE_LEFT: "pane.moveLeft",
  PANE_MOVE_RIGHT: "pane.moveRight",
  PANE_MOVE_UP: "pane.moveUp",
  PANE_MOVE_DOWN: "pane.moveDown",
  PANE_MOVE_TO_TAB: "pane.moveToTab",

  // Terminal commands
  TERMINAL_CREATE_CLOUD: "terminal.createCloud",
  TERMINAL_OPEN_IN_VSCODE: "terminal.openInVSCode",

  // Agent session commands
  AGENT_MANAGE_SESSIONS: "agent.manageSessions",
  AGENT_MERGE_AND_CLOSE: "agent.mergeAndClose",
  AGENT_TERMINATE: "agent.terminate",
} as const;
