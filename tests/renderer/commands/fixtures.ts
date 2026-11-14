import type { CommandContext } from "@/commands/core/types";

/** A CommandContext with every service and accessor empty. */
export function commandContext(
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    tabs: null,
    panes: null,
    terminals: null,
    workspaces: null,
    commands: null,
    dialogs: null,
    notifications: null,
    settings: null,
    contextKeys: null,
    view: null,
    workspace: null,
    agent: null,
    activeTab: null,
    activePaneId: null,
    workspaceName: null,
    allTabs: [],
    ...overrides,
  };
}
