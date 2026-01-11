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
  VIEW_TOGGLE_SIDEBAR: "view.toggleSidebar",
  VIEW_OPEN_SETTINGS: "view.openSettings",
  VIEW_OPEN_KEYBINDINGS: "view.openKeybindings",
  VIEW_OPEN_PANE_ACTIONS: "view.openPaneActions",
  VIEW_OPEN_AGENTS: "view.openAgents",
  VIEW_SHOW_COMMAND_PALETTE: "view.showCommandPalette",
  VIEW_RESET_LAYOUT: "view.resetLayout",

  // Tab commands
  TAB_NEW: "tab.new",
  TAB_CLOSE: "tab.close",
  TAB_DUPLICATE: "tab.duplicate",
  TAB_DUPLICATE_WITH_CWD: "tab.duplicateWithCwd",
  TAB_DUPLICATE_INTO_WORKTREE: "tab.duplicateIntoWorktree",
  TAB_RENAME: "tab.rename",
  TAB_LOCK: "tab.lock",
  TAB_UNLOCK: "tab.unlock",
  TAB_TOGGLE_SYNCHRONIZE: "tab.toggleSynchronize",

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
  PANE_NAVIGATE_LEFT: "pane.navigateLeft",
  PANE_NAVIGATE_RIGHT: "pane.navigateRight",
  PANE_NAVIGATE_UP: "pane.navigateUp",
  PANE_NAVIGATE_DOWN: "pane.navigateDown",
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
  PANE_COLLAPSE: "pane.collapse",
  PANE_EXPAND: "pane.expand",
  PANE_SPLIT_LEFT_BROWSER: "pane.splitLeftBrowser",
  PANE_SPLIT_RIGHT_BROWSER: "pane.splitRightBrowser",
  PANE_SPLIT_TOP_BROWSER: "pane.splitTopBrowser",
  PANE_SPLIT_BOTTOM_BROWSER: "pane.splitBottomBrowser",
  PANE_SPLIT_LEFT_EDITOR: "pane.splitLeftEditor",
  PANE_SPLIT_RIGHT_EDITOR: "pane.splitRightEditor",
  PANE_SPLIT_TOP_EDITOR: "pane.splitTopEditor",
  PANE_SPLIT_BOTTOM_EDITOR: "pane.splitBottomEditor",
  PANE_SPLIT_LEFT_CANVAS: "pane.splitLeftCanvas",
  PANE_SPLIT_RIGHT_CANVAS: "pane.splitRightCanvas",
  PANE_SPLIT_TOP_CANVAS: "pane.splitTopCanvas",
  PANE_SPLIT_BOTTOM_CANVAS: "pane.splitBottomCanvas",
  PANE_CLONE: "pane.clone",
  PANE_VIEW_FILES: "pane.viewFiles",

  // Terminal commands
  TERMINAL_CREATE_CLOUD: "terminal.createCloud",
  TERMINAL_OPEN_IN_VSCODE: "terminal.openInVSCode",

  // Agent session commands
  AGENT_LAUNCH: "agent.launch",
  AGENT_MANAGE_SESSIONS: "agent.manageSessions",
  AGENT_MERGE_AND_CLOSE: "agent.mergeAndClose",
  AGENT_TERMINATE: "agent.terminate",
  AGENT_DELETE_ALL_WORKTREES: "agent.deleteAllWorktrees",

  // Browser commands
  BROWSER_TOGGLE_TOOLBAR: "browser.toggleToolbar",

  // Editor commands
  EDITOR_TOGGLE_SIDEBAR: "editor.toggleSidebar",
  EDITOR_FOCUS_SIDEBAR: "editor.focusSidebar",
} as const;
