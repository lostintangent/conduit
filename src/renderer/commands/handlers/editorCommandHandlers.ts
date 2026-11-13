/**
 * Editor Command Handler Registry
 *
 * This module provides a registry pattern for editor pane commands.
 * It allows EditorPaneV2 components to register their handlers when mounted,
 * which can then be invoked by the command system.
 *
 * This approach keeps state local to the editor component while allowing
 * the global command system to trigger actions on the active editor.
 *
 * @example
 * ```tsx
 * // In EditorPaneV2:
 * useEffect(() => {
 *   return registerEditorHandlers(pane.id, {
 *     toggleSidebar: handleToggleTree,
 *     focusSidebar: handleFocusTree,
 *   });
 * }, [pane.id, handleToggleTree, handleFocusTree]);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Handler function type for editor commands.
 */
export type EditorCommandHandler = () => void;

/**
 * Collection of handlers that an editor pane can provide.
 */
export interface EditorCommandHandlers {
  /** Toggle the file tree sidebar visibility */
  toggleSidebar?: EditorCommandHandler;
  /** Show and focus the file tree sidebar */
  focusSidebar?: EditorCommandHandler;
  /** Reveal and select the currently active file in the file tree */
  revealActiveFile?: EditorCommandHandler;
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Map of pane ID to registered handlers.
 * Each EditorPaneV2 instance registers its handlers here when mounted.
 */
const registeredHandlers = new Map<string, EditorCommandHandlers>();

/**
 * Register command handlers for an editor pane.
 *
 * @param paneId - The unique ID of the editor pane
 * @param handlers - The command handlers to register
 * @returns Cleanup function to unregister the handlers
 */
export function registerEditorHandlers(
  paneId: string,
  handlers: EditorCommandHandlers,
): () => void {
  registeredHandlers.set(paneId, handlers);

  return () => {
    registeredHandlers.delete(paneId);
  };
}

/**
 * Invoke a command handler for a specific editor pane.
 *
 * @param paneId - The pane ID to invoke the command on
 * @param command - The command to invoke
 * @returns true if the handler was found and invoked, false otherwise
 */
export function invokeEditorCommand(
  paneId: string,
  command: keyof EditorCommandHandlers,
): boolean {
  const handlers = registeredHandlers.get(paneId);
  const handler = handlers?.[command];

  if (handler) {
    handler();
    return true;
  }

  return false;
}
