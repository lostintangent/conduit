/**
 * Terminal command handlers
 *
 * Handlers for terminal-related commands like opening in VS Code.
 */

/**
 * Open the current working directory in VS Code
 *
 * @param activeTab - The active tab containing panes
 */
export async function handleOpenInVSCode(activeTab: any): Promise<void> {
  const activePane =
    activeTab && activeTab.activePaneId
      ? activeTab.panes[activeTab.activePaneId]
      : undefined;

  if (activePane?.type === "terminal" && activePane.cwd) {
    await window.conduit.runBackgroundCommand({
      command: "code-insiders",
      args: [activePane.cwd],
      cwd: activePane.cwd,
    });
  }
}
