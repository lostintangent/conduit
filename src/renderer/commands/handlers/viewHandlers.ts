/**
 * View command handlers
 *
 * Handlers for view-related commands including design mode and keyboard shortcuts.
 */

/**
 * Toggle design mode on/off
 *
 * @param applicationMode - Current application mode
 * @param setApplicationMode - Function to update application mode
 */
export function handleToggleDesignMode(
  applicationMode: 'normal' | 'design',
  setApplicationMode: (mode: 'normal' | 'design') => void
): void {
  const newMode = applicationMode === 'design' ? 'normal' : 'design';
  setApplicationMode(newMode);
}

/**
 * Open the keyboard shortcuts editor
 *
 * @param setShowKeybindingsEditor - Function to show the keybindings editor
 */
export function handleOpenKeyboardShortcuts(
  setShowKeybindingsEditor: (show: boolean) => void
): void {
  setShowKeybindingsEditor(true);
}

/**
 * Show the command palette
 *
 * @param setIsCommandPaletteOpenOverride - Function to override command palette open state
 */
export function handleShowCommandPalette(
  setIsCommandPaletteOpenOverride: (open: boolean) => void
): void {
  setIsCommandPaletteOpenOverride(true);
}

/**
 * Reset layout sizes for a tab
 *
 * @param tabId - ID of the tab to reset
 * @param resetLayoutSizes - Function to reset layout sizes
 */
export function handleResetLayout(
  tabId: string,
  resetLayoutSizes: (tabId: string) => void
): void {
  resetLayoutSizes(tabId);
}
