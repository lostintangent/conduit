/**
 * useFileTreeChangesContextMenu - Hook for showing the file tree context menu in changes mode.
 *
 * This hook is specialized for the FileTreeChanges component (git changes view).
 * It integrates with the command system to:
 * - Set context keys for changes mode (staged/unstaged, mapKey)
 * - Build menu items from registered commands
 * - Handle command execution when menu items are selected
 *
 * For the normal file tree mode, see useFileTreeContextMenu.
 *
 * @example
 * ```tsx
 * const { showContextMenu } = useFileTreeChangesContextMenu({
 *   cwd,
 *   onStage: handleStage,
 *   onUnstage: handleUnstage,
 *   onRevert: handleRevert,
 *   onRename: handleRename,
 *   onDelete: handleDelete,
 * });
 *
 * // Call on right-click
 * showContextMenu({ path, mapKey, isStaged, isDirectory, event });
 * ```
 */

import { useCallback, useEffect, useRef } from "react";
import {
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
  getMenuRegistry,
} from "@/commands";
import {
  fileTreeChangesMode,
  fileTreeCwd,
  fileTreeFocused,
  fileTreeItemFocused,
  fileTreeItemIsDirectory,
  fileTreeItemIsFile,
  fileTreeItemIsStaged,
  fileTreeItemMapKey,
  fileTreeTargetPath,
} from "@/commands/contextKeys/appContextKeys";
import {
  type FileTreeChangesCommandCallbacks,
  registerFileTreeChangesCallbacks,
} from "@/commands/fileTreeCommands";
import { formatKeybindingForElectron } from "@/commands/keybindings/utils";
import { MenuId } from "@/commands/menus/types";

// ============================================================================
// Types
// ============================================================================

export interface UseFileTreeChangesContextMenuOptions {
  /** Current working directory of the file tree */
  cwd: string;

  /** Callback when "Stage" command is executed */
  onStage: (mapKey: string) => void;

  /** Callback when "Unstage" command is executed */
  onUnstage: (mapKey: string) => void;

  /** Callback when "Revert" command is executed */
  onRevert: (mapKey: string) => void;

  /** Callback when "Rename" command is executed (unstaged files only) */
  onRename: (path: string) => void;

  /** Callback when "Delete" command is executed (unstaged files only) */
  onDelete: (path: string) => void;

  /** Callback when "New File" command is executed (path is parent directory) */
  onNewFile: (parentPath: string) => void;

  /** Callback when "New Folder" command is executed (path is parent directory) */
  onNewFolder: (parentPath: string) => void;
}

export interface ShowContextMenuOptions {
  /** Absolute path of the file/folder */
  path: string;

  /**
   * Map key for identifying the entry.
   * May include UNSTAGED_KEY_SUFFIX for partially staged files.
   */
  mapKey: string;

  /** Whether the item is in the staged section */
  isStaged: boolean;

  /** Whether the item is a directory (folder in nested view) */
  isDirectory: boolean;

  /** The mouse event that triggered the context menu */
  event: React.MouseEvent;
}

export interface UseFileTreeChangesContextMenuResult {
  /**
   * Show the context menu for a file tree changes item.
   * Call this on right-click.
   */
  showContextMenu: (options: ShowContextMenuOptions) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing the file tree context menu in changes mode.
 */
export function useFileTreeChangesContextMenu({
  cwd,
  onStage,
  onUnstage,
  onRevert,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
}: UseFileTreeChangesContextMenuOptions): UseFileTreeChangesContextMenuResult {
  // Store callbacks in a ref so we can update them without re-registering
  const callbacksRef = useRef<FileTreeChangesCommandCallbacks>({
    onStage,
    onUnstage,
    onRevert,
    onRename,
    onDelete,
    onNewFile,
    onNewFolder,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onStage,
      onUnstage,
      onRevert,
      onRename,
      onDelete,
      onNewFile,
      onNewFolder,
    };
  }, [
    onStage,
    onUnstage,
    onRevert,
    onRename,
    onDelete,
    onNewFile,
    onNewFolder,
  ]);

  // Register callbacks with the command system
  useEffect(() => {
    const unregister = registerFileTreeChangesCallbacks({
      onStage: (mapKey) => callbacksRef.current.onStage(mapKey),
      onUnstage: (mapKey) => callbacksRef.current.onUnstage(mapKey),
      onRevert: (mapKey) => callbacksRef.current.onRevert(mapKey),
      onRename: (path) => callbacksRef.current.onRename(path),
      onDelete: (path) => callbacksRef.current.onDelete(path),
      onNewFile: (path) => callbacksRef.current.onNewFile(path),
      onNewFolder: (path) => callbacksRef.current.onNewFolder(path),
    });

    return unregister;
  }, []);

  // Update cwd context key when it changes
  useEffect(() => {
    try {
      const contextKeyService = getContextKeyService();
      contextKeyService.setGlobal(fileTreeCwd.key, cwd);
    } catch {
      // Command system not initialized yet
    }
  }, [cwd]);

  /**
   * Show the context menu for a file tree changes item.
   */
  const showContextMenu = useCallback(
    ({
      path,
      mapKey,
      isStaged,
      isDirectory,
      event,
    }: ShowContextMenuOptions) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        const contextKeyService = getContextKeyService();
        const menuRegistry = getMenuRegistry();
        const commandRegistry = getCommandRegistry();
        const keybindingRegistry = getKeybindingRegistry();

        // Set context keys for the right-clicked item
        // Common keys
        contextKeyService.setGlobal(fileTreeFocused.key, true);
        contextKeyService.setGlobal(fileTreeItemFocused.key, true);
        contextKeyService.setGlobal(fileTreeTargetPath.key, path);
        contextKeyService.setGlobal(fileTreeCwd.key, cwd);
        contextKeyService.setGlobal(fileTreeItemIsFile.key, !isDirectory);
        contextKeyService.setGlobal(fileTreeItemIsDirectory.key, isDirectory);

        // Changes mode specific keys
        contextKeyService.setGlobal(fileTreeChangesMode.key, true);
        contextKeyService.setGlobal(fileTreeItemIsStaged.key, isStaged);
        contextKeyService.setGlobal(fileTreeItemMapKey.key, mapKey);

        // Get context values for evaluating when clauses
        const contextValues = contextKeyService.getAll();

        // Get menu items and filter by when clauses
        const menuItems = menuRegistry.getSortedMenuItems(
          MenuId.FileTreeContext,
        );
        const visibleItems = menuItems
          .filter((item) => {
            if (!item.when) return true;
            return item.when.evaluate(contextValues);
          })
          .map((item) => {
            const command = commandRegistry.getCommand(item.commandId);

            // Get keybinding for this command
            const keybindings = keybindingRegistry.getKeybindingsForCommand(
              item.commandId,
            );
            const keybinding = keybindings[0]
              ? formatKeybindingForElectron(keybindings[0].chords)
              : undefined;

            return {
              commandId: item.commandId,
              title: item.title || command?.title || item.commandId,
              group: item.group,
              enabled: true,
              keybinding,
            };
          });

        // Show native context menu
        window.conduit.showContextMenu({
          tabId: "fileTreeChanges",
          menuItems: visibleItems,
        });
      } catch (error) {
        console.error("Failed to show file tree changes context menu:", error);
      }
    },
    [cwd],
  );

  // Listen for context menu command events
  useEffect(() => {
    const unsubscribe = window.conduit.onContextMenuCommand((payload) => {
      // Only handle commands for our menu
      if (payload.tabId !== "fileTreeChanges") return;

      try {
        const commandRegistry = getCommandRegistry();
        const command = commandRegistry.getCommand(payload.commandId);
        if (command) {
          // Call run directly to bypass when clause check
          // (file tree commands use When.never() to hide from command palette)
          command.run({} as any);
        }
      } catch (error) {
        console.error("Failed to execute file tree changes command:", error);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    showContextMenu,
  };
}
