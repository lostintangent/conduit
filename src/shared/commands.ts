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

  // Workspace commands
  WORKSPACE_SAVE: "workspace.save",
  WORKSPACE_RENAME: "workspace.rename",
  WORKSPACE_DUPLICATE: "workspace.duplicate",
  WORKSPACE_CLOSE: "workspace.close",
  WORKSPACE_OPEN: "workspace.open",
  WORKSPACE_OPEN_LAST: "workspace.openLast",

  // Pane commands
  PANE_OPEN_WEB_PAGE: "pane.openWebPage",

  // Terminal commands
  TERMINAL_CREATE_CLOUD: "terminal.createCloud",
  TERMINAL_OPEN_IN_VSCODE: "terminal.openInVSCode",

  // Agent session commands
  AGENT_MANAGE_SESSIONS: "agent.manageSessions",
  AGENT_MERGE_AND_CLOSE: "agent.mergeAndClose",
  AGENT_TERMINATE: "agent.terminate",
} as const;
