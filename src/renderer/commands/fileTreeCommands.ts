/**
 * File tree command registrations
 *
 * Commands for interacting with the file tree panel in both modes:
 *
 * Normal mode (full file tree):
 * - New file/folder
 * - Rename
 * - Delete
 * - Copy path
 * - Copy relative path
 * - Reveal in Finder
 *
 * Changes mode (git changes view):
 * - Stage
 * - Unstage
 * - Revert
 * - Copy path (shared)
 * - Copy relative path (shared)
 * - Reveal in Finder (shared)
 * - Rename (unstaged only)
 * - Delete (unstaged only)
 *
 * These commands are only available via the file tree context menu
 * (not the command palette). They use context keys to determine
 * the target path and mode-specific behavior.
 */

import type { CommandRegistry } from "@/commands";
import { When, getContextKeyService } from "@/commands";
import {
  dotfilesEnabled,
  fileTreeChangesMode,
  fileTreeCwd,
  fileTreeItemFocused,
  fileTreeItemInHomeDirectory,
  fileTreeItemIsFile,
  fileTreeItemIsStaged,
  fileTreeItemIsSymlink,
  fileTreeItemMapKey,
  fileTreeTargetPath,
} from "@/commands/contextKeys/appContextKeys";
import { MenuId } from "@/commands/menus/types";
import { MonacoModelRegistry } from "@/components/panes/editor/registry/MonacoModelRegistry";

/**
 * File tree command IDs
 */
export const FileTreeCommands = {
  // Normal mode commands
  NEW_FILE: "fileTree.newFile",
  NEW_FOLDER: "fileTree.newFolder",
  RENAME: "fileTree.rename",
  DELETE: "fileTree.delete",
  // Shared commands (both modes)
  COPY_PATH: "fileTree.copyPath",
  COPY_RELATIVE_PATH: "fileTree.copyRelativePath",
  REVEAL_IN_FINDER: "fileTree.revealInFinder",
  ADD_TO_DOTFILES: "fileTree.addToDotfiles",
  // Changes mode commands
  STAGE: "fileTree.stage",
  UNSTAGE: "fileTree.unstage",
  REVERT: "fileTree.revert",
} as const;

// ============================================================================
// Callback Registries
// ============================================================================

/**
 * Callbacks for normal mode file tree commands.
 * Used by FileTreeNormal for file/folder operations.
 */
export interface FileTreeCommandCallbacks {
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

/**
 * Callbacks for changes mode file tree commands.
 * Used by FileTreeChanges for git operations.
 */
export interface FileTreeChangesCommandCallbacks {
  onStage: (mapKey: string) => void;
  onUnstage: (mapKey: string) => void;
  onRevert: (mapKey: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
}

let fileTreeCallbacks: FileTreeCommandCallbacks | null = null;
let fileTreeChangesCallbacks: FileTreeChangesCommandCallbacks | null = null;

/**
 * Register callbacks for normal mode file tree commands.
 * Called by FileTreeNormal when it mounts.
 */
export function registerFileTreeCallbacks(
  callbacks: FileTreeCommandCallbacks,
): () => void {
  fileTreeCallbacks = callbacks;
  return () => {
    // Only clear if we're still the registered instance — prevents
    // one pane's cleanup from wiping another pane's callbacks
    if (fileTreeCallbacks === callbacks) {
      fileTreeCallbacks = null;
    }
  };
}

/**
 * Set the active file tree callbacks for the current command execution.
 * Called by the context menu listener to ensure the correct pane's
 * callbacks are used when multiple panes are mounted.
 */
export function activateFileTreeCallbacks(
  callbacks: FileTreeCommandCallbacks,
): void {
  fileTreeCallbacks = callbacks;
}

/**
 * Set the active changes callbacks for the current command execution.
 */
export function activateFileTreeChangesCallbacks(
  callbacks: FileTreeChangesCommandCallbacks,
): void {
  fileTreeChangesCallbacks = callbacks;
}

/**
 * Register callbacks for changes mode file tree commands.
 * Called by FileTreeChanges when it mounts.
 */
export function registerFileTreeChangesCallbacks(
  callbacks: FileTreeChangesCommandCallbacks,
): () => void {
  fileTreeChangesCallbacks = callbacks;
  return () => {
    if (fileTreeChangesCallbacks === callbacks) {
      fileTreeChangesCallbacks = null;
    }
  };
}

// ============================================================================
// Context Key Helpers
// ============================================================================

function getContextString(key: string): string {
  const value = getContextKeyService().getAll()[key];
  return typeof value === "string" ? value : "";
}

function isContextTrue(key: string): boolean {
  return getContextKeyService().getAll()[key] === true;
}

const getTargetPath = () => getContextString(fileTreeTargetPath.key);
const isTargetFile = () => isContextTrue(fileTreeItemIsFile.key);
const isChangesMode = () => isContextTrue(fileTreeChangesMode.key);
const getCwd = () => getContextString(fileTreeCwd.key);
// Differs from the path for partially staged files in changes mode
const getMapKey = () => getContextString(fileTreeItemMapKey.key);

/**
 * Get parent directory of a path.
 */
function getParentPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return path.slice(0, lastSlash);
}

/**
 * Get the appropriate parent path for creating new items.
 * If target is a file, returns parent directory.
 * If target is a directory, returns the directory itself.
 * If target is empty, returns cwd.
 */
function getParentPathForCreate(): string {
  const path = getTargetPath();
  if (!path) {
    // Empty space right-click - use cwd
    return getCwd();
  }
  if (isTargetFile()) {
    // File right-click - use parent directory
    return getParentPath(path);
  }
  // Directory right-click - use the directory
  return path;
}

/**
 * Compute relative path from cwd.
 */
function getRelativePath(fullPath: string, cwd: string): string {
  if (fullPath.startsWith(cwd)) {
    const relative = fullPath.slice(cwd.length);
    return relative.startsWith("/") ? relative.slice(1) : relative;
  }
  return fullPath;
}

/**
 * Register all file tree commands
 */
export function registerFileTreeCommands(
  commandRegistry: CommandRegistry,
): void {
  // ==========================================================================
  // Normal Mode Commands (only shown when NOT in changes mode)
  // ==========================================================================

  // New File - available in both modes, for files and directories
  // When clicking on a file, creates in the parent directory
  commandRegistry.registerCommand({
    id: FileTreeCommands.NEW_FILE,
    title: "New File",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "1_new",
        order: 1,
        // Show for both files and directories (no when clause = always visible)
      },
    ],
    run: () => {
      const parentPath = getParentPathForCreate();
      if (!parentPath) return;

      // Route to appropriate callback based on mode
      if (isChangesMode()) {
        fileTreeChangesCallbacks?.onNewFile(parentPath);
      } else {
        fileTreeCallbacks?.onNewFile(parentPath);
      }
    },
  });

  // New Folder - available in both modes, for files and directories
  // When clicking on a file, creates in the parent directory
  commandRegistry.registerCommand({
    id: FileTreeCommands.NEW_FOLDER,
    title: "New Folder",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "1_new",
        order: 2,
        // Show for both files and directories (no when clause = always visible)
      },
    ],
    run: () => {
      const parentPath = getParentPathForCreate();
      if (!parentPath) return;

      // Route to appropriate callback based on mode
      if (isChangesMode()) {
        fileTreeChangesCallbacks?.onNewFolder(parentPath);
      } else {
        fileTreeCallbacks?.onNewFolder(parentPath);
      }
    },
  });

  // ==========================================================================
  // Changes Mode Commands (only shown when in changes mode)
  // ==========================================================================

  // Stage - only in changes mode, only for unstaged files
  commandRegistry.registerCommand({
    id: FileTreeCommands.STAGE,
    title: "Stage",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "6_git",
        order: 1,
        when: When.and(
          fileTreeChangesMode.isTrue(),
          fileTreeItemIsStaged.isFalse(),
        ),
      },
    ],
    run: () => {
      const mapKey = getMapKey();
      if (mapKey && fileTreeChangesCallbacks?.onStage) {
        fileTreeChangesCallbacks.onStage(mapKey);
      }
    },
  });

  // Unstage - only in changes mode, only for staged files
  commandRegistry.registerCommand({
    id: FileTreeCommands.UNSTAGE,
    title: "Unstage",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "6_git",
        order: 2,
        when: When.and(
          fileTreeChangesMode.isTrue(),
          fileTreeItemIsStaged.isTrue(),
        ),
      },
    ],
    run: () => {
      const mapKey = getMapKey();
      if (mapKey && fileTreeChangesCallbacks?.onUnstage) {
        fileTreeChangesCallbacks.onUnstage(mapKey);
      }
    },
  });

  // Revert - only in changes mode, only for unstaged files
  commandRegistry.registerCommand({
    id: FileTreeCommands.REVERT,
    title: "Revert",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "6_git",
        order: 3,
        when: When.and(
          fileTreeChangesMode.isTrue(),
          fileTreeItemIsStaged.isFalse(),
        ),
      },
    ],
    run: () => {
      const mapKey = getMapKey();
      if (mapKey && fileTreeChangesCallbacks?.onRevert) {
        fileTreeChangesCallbacks.onRevert(mapKey);
      }
    },
  });

  // ==========================================================================
  // Shared Commands (shown in both modes with conditional visibility)
  // ==========================================================================

  // Rename - normal mode: always, changes mode: unstaged only
  // Note: Enter keybinding is handled locally in FileTreeNormal to avoid conflicts
  commandRegistry.registerCommand({
    id: FileTreeCommands.RENAME,
    title: "Rename",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "2_edit",
        order: 1,
        when: When.and(
          fileTreeItemFocused.isTrue(),
          When.or(
            fileTreeChangesMode.isFalse(),
            When.and(
              fileTreeChangesMode.isTrue(),
              fileTreeItemIsStaged.isFalse(),
            ),
          ),
        ),
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (!path) return;

      // Route to appropriate callback based on mode
      if (isChangesMode()) {
        fileTreeChangesCallbacks?.onRename(path);
      } else {
        fileTreeCallbacks?.onRename(path);
      }
    },
  });

  // Delete - normal mode: always, changes mode: unstaged only
  // Note: Delete/Backspace keybindings are handled locally in FileTreeNormal to avoid conflicts
  commandRegistry.registerCommand({
    id: FileTreeCommands.DELETE,
    title: "Delete",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "2_edit",
        order: 2,
        when: When.and(
          fileTreeItemFocused.isTrue(),
          When.or(
            fileTreeChangesMode.isFalse(),
            When.and(
              fileTreeChangesMode.isTrue(),
              fileTreeItemIsStaged.isFalse(),
            ),
          ),
        ),
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (!path) return;

      // Route to appropriate callback based on mode
      if (isChangesMode()) {
        fileTreeChangesCallbacks?.onDelete(path);
      } else {
        fileTreeCallbacks?.onDelete(path);
      }
    },
  });

  // Copy Path
  commandRegistry.registerCommand({
    id: FileTreeCommands.COPY_PATH,
    title: "Copy Path",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "3_copy",
        order: 1,
        when: fileTreeItemFocused.isTrue(),
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (path) {
        window.conduit.writeClipboard(path);
      }
    },
  });

  // Copy Relative Path
  commandRegistry.registerCommand({
    id: FileTreeCommands.COPY_RELATIVE_PATH,
    title: "Copy Relative Path",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "3_copy",
        order: 2,
        when: fileTreeItemFocused.isTrue(),
      },
    ],
    run: () => {
      const path = getTargetPath();
      const cwd = getCwd();
      if (path) {
        const relativePath = getRelativePath(path, cwd);
        window.conduit.writeClipboard(relativePath);
      }
    },
  });

  // Reveal in Finder
  commandRegistry.registerCommand({
    id: FileTreeCommands.REVEAL_IN_FINDER,
    title: "Reveal in Finder",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "4_reveal",
        order: 1,
      },
    ],
    run: async () => {
      const path = getTargetPath() || getCwd();
      if (path) {
        await window.conduit.showItemInFolder(path);
      }
    },
  });

  // Add to Dotfiles - only in normal mode
  // Only shown for files in the home directory that are not symlinks, when dotfiles is enabled
  commandRegistry.registerCommand({
    id: FileTreeCommands.ADD_TO_DOTFILES,
    title: "Add to Dotfiles",
    category: "File Tree",
    when: When.never(),
    menu: [
      {
        id: MenuId.FileTreeContext,
        group: "5_dotfiles",
        order: 1,
        when: When.and(
          fileTreeChangesMode.isFalse(),
          fileTreeItemIsFile.isTrue(),
          fileTreeItemInHomeDirectory.isTrue(),
          fileTreeItemIsSymlink.isFalse(),
          dotfilesEnabled.isTrue(),
        ),
      },
    ],
    run: async () => {
      const path = getTargetPath();
      if (path) {
        // Suppress orphan warning since symlink will be created immediately
        MonacoModelRegistry.getInstance().suppressOrphanWarning(path);
        await window.conduit.addToDotfiles(path);
      }
    },
  });
}
