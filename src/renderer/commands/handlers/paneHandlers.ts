/**
 * Pane command handlers
 *
 * Handlers for pane-related commands including opening web pages.
 */

/**
 * Open web page dialog
 *
 * @param setIsUrlDialogOpen - Function to show URL dialog
 */
export function handleOpenWebPage(
  setIsUrlDialogOpen?: (open: boolean) => void,
): void {
  setIsUrlDialogOpen?.(true);
}
