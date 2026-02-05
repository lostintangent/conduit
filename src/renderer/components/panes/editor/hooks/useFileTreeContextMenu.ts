/**
 * useFileTreeContextMenu - Hook for showing the file tree context menu.
 *
 * This hook integrates with the command system to:
 * - Set context keys based on the right-clicked item
 * - Build menu items from registered commands
 * - Handle command execution when menu items are selected
 *
 * @example
 * ```tsx
 * const { showContextMenu, setFocusState } = useFileTreeContextMenu({
 *   cwd,
 *   homeDirectory,
 *   onNewFile: handleNewFile,
 *   onNewFolder: handleNewFolder,
 *   onRename: handleRename,
 *   onDelete: handleDelete,
 * });
 *
 * // Call on right-click
 * showContextMenu(path, isFile, isSymlink, e);
 *
 * // Call on focus changes
 * setFocusState(isFocused, focusedPath, entryType);
 * ```
 */

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
  fileTreeItemInHomeDirectory,
  fileTreeItemIsDirectory,
  fileTreeItemIsFile,
  fileTreeItemIsSymlink,
  fileTreeTargetPath,
} from "@/commands/contextKeys/appContextKeys";
import {
  registerFileTreeCallbacks,
  type FileTreeCommandCallbacks,
} from "@/commands/fileTreeCommands";
import { formatKeybindingForElectron } from "@/commands/keybindings/utils";
import { MenuId } from "@/commands/menus/types";
import { useCallback, useEffect, useRef } from "react";

export interface UseFileTreeContextMenuOptions {
  /** Current working directory of the file tree */
  cwd: string;

  /** User's home directory (for dotfiles context) */
  homeDirectory?: string;

  /** Callback when "New File" command is executed (path is parent directory) */
  onNewFile: (parentPath: string) => void;

  /** Callback when "New Folder" command is executed (path is parent directory) */
  onNewFolder: (parentPath: string) => void;

  /** Callback when "Rename" command is executed */
  onRename: (path: string) => void;

  /** Callback when "Delete" command is executed */
  onDelete: (path: string) => void;
}

export interface UseFileTreeContextMenuResult {
  /**
   * Show the context menu for a file tree item.
   * Call this on right-click.
   */
  showContextMenu: (
    path: string,
    isFile: boolean,
    isSymlink: boolean,
    e: React.MouseEvent,
  ) => void;

  /**
   * Update the focus state context keys.
   * Call this when focus changes within the file tree.
   */
  setFocusState: (
    isFocused: boolean,
    focusedPath: string | null,
    entryType: "file" | "directory" | null,
  ) => void;
}

/**
 * Hook for managing the file tree context menu.
 */
export function useFileTreeContextMenu({
  cwd,
  homeDirectory,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: UseFileTreeContextMenuOptions): UseFileTreeContextMenuResult {
  // Store callbacks in a ref so we can update them without re-registering
  const callbacksRef = useRef<FileTreeCommandCallbacks>({
    onNewFile,
    onNewFolder,
    onRename,
    onDelete,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onNewFile,
      onNewFolder,
      onRename,
      onDelete,
    };
  }, [onNewFile, onNewFolder, onRename, onDelete]);

  // Register callbacks with the command system
  useEffect(() => {
    const unregister = registerFileTreeCallbacks({
      onNewFile: (path) => callbacksRef.current.onNewFile(path),
      onNewFolder: (path) => callbacksRef.current.onNewFolder(path),
      onRename: (path) => callbacksRef.current.onRename(path),
      onDelete: (path) => callbacksRef.current.onDelete(path),
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
   * Update focus state context keys.
   */
  const setFocusState = useCallback(
    (
      isFocused: boolean,
      focusedPath: string | null,
      entryType: "file" | "directory" | null,
    ) => {
      try {
        const contextKeyService = getContextKeyService();

        contextKeyService.setGlobal(fileTreeFocused.key, isFocused);
        contextKeyService.setGlobal(
          fileTreeItemFocused.key,
          isFocused && focusedPath !== null,
        );
        contextKeyService.setGlobal(fileTreeTargetPath.key, focusedPath ?? "");
        contextKeyService.setGlobal(
          fileTreeItemIsFile.key,
          entryType === "file",
        );
        contextKeyService.setGlobal(
          fileTreeItemIsDirectory.key,
          entryType === "directory",
        );
      } catch {
        // Command system not initialized yet
      }
    },
    [],
  );

  /**
   * Show the context menu for a file tree item.
   * Pass empty path for empty space clicks (will use cwd as target).
   */
  const showContextMenu = useCallback(
    (
      path: string,
      isFile: boolean,
      isSymlink: boolean,
      e: React.MouseEvent,
    ) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const contextKeyService = getContextKeyService();
        const menuRegistry = getMenuRegistry();
        const commandRegistry = getCommandRegistry();
        const keybindingRegistry = getKeybindingRegistry();

        // For empty space clicks (path=""), treat as clicking on the root directory
        const isEmptySpaceClick = path === "";

        // Determine if the path is in the home directory
        const isInHomeDirectory = homeDirectory
          ? path.startsWith(homeDirectory + "/") || path === homeDirectory
          : false;

        // Set context keys for the right-clicked item
        contextKeyService.setGlobal(fileTreeFocused.key, true);
        // For empty space clicks, no specific item is focused
        contextKeyService.setGlobal(
          fileTreeItemFocused.key,
          !isEmptySpaceClick,
        );
        contextKeyService.setGlobal(fileTreeTargetPath.key, path);
        // Empty space click is treated as directory (the root)
        contextKeyService.setGlobal(
          fileTreeItemIsFile.key,
          isEmptySpaceClick ? false : isFile,
        );
        contextKeyService.setGlobal(
          fileTreeItemIsDirectory.key,
          isEmptySpaceClick ? true : !isFile,
        );
        contextKeyService.setGlobal(fileTreeItemIsSymlink.key, isSymlink);
        contextKeyService.setGlobal(
          fileTreeItemInHomeDirectory.key,
          isInHomeDirectory,
        );
        contextKeyService.setGlobal(fileTreeCwd.key, cwd);

        // Explicitly set changes mode to false (normal file tree mode)
        contextKeyService.setGlobal(fileTreeChangesMode.key, false);

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
        // We use a unique tabId to identify our menu in the callback
        window.conduit.showContextMenu({
          tabId: "fileTree",
          menuItems: visibleItems,
        });
      } catch (error) {
        console.error("Failed to show file tree context menu:", error);
      }
    },
    [cwd, homeDirectory],
  );

  // Listen for context menu command events
  useEffect(() => {
    const unsubscribe = window.conduit.onContextMenuCommand((payload) => {
      // Only handle commands for our menu
      if (payload.tabId !== "fileTree") return;

      try {
        const commandRegistry = getCommandRegistry();
        const command = commandRegistry.getCommand(payload.commandId);
        if (command) {
          // Call run directly to bypass when clause check
          // (file tree commands use When.never() to hide from command palette)
          command.run({} as any);
        }
      } catch (error) {
        console.error("Failed to execute file tree command:", error);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    showContextMenu,
    setFocusState,
  };
}
