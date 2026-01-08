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
 * - Reveal in Finder/Explorer
 *
 * Changes mode (git changes view):
 * - Stage
 * - Unstage
 * - Revert
 * - Copy path (shared)
 * - Copy relative path (shared)
 * - Reveal in Finder/Explorer (shared)
 * - Rename (unstaged only)
 * - Delete (unstaged only)
 *
 * These commands are only available via the file tree context menu
 * (not the command palette). They use context keys to determine
 * the target path and mode-specific behavior.
 */

import type { ICommandRegistry } from "@/commands";
import { When, getContextKeyService } from "@/commands";
import {
  dotfilesEnabled,
  fileTreeChangesMode,
  fileTreeCwd,
  fileTreeItemInHomeDirectory,
  fileTreeItemIsDirectory,
  fileTreeItemIsFile,
  fileTreeItemIsStaged,
  fileTreeItemIsSymlink,
  fileTreeItemMapKey,
  fileTreeTargetPath,
} from "@/commands/contextKeys/appContextKeys";
import { MenuId } from "@/commands/menus/types";
import { MonacoModelRegistry } from "@/components/panes/editor-v2/registry/MonacoModelRegistry";

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

/**
 * Get platform-specific label for "Reveal in Finder"
 */
function getRevealInFinderLabel(): string {
  const platform = window.conduit.platform;
  if (platform === "darwin") return "Reveal in Finder";
  if (platform === "win32") return "Show in Explorer";
  return "Show in File Manager";
}

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
    fileTreeCallbacks = null;
  };
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
    fileTreeChangesCallbacks = null;
  };
}

// ============================================================================
// Context Key Helpers
// ============================================================================

/**
 * Get the target path from context keys.
 */
function getTargetPath(): string {
  try {
    const contextKeyService = getContextKeyService();
    const values = contextKeyService.getAll();
    const path = values[fileTreeTargetPath.key];
    return typeof path === "string" ? path : "";
  } catch {
    return "";
  }
}

/**
 * Get the map key from context keys.
 * Used in changes mode where mapKey may differ from path for partially staged files.
 */
function getMapKey(): string {
  try {
    const contextKeyService = getContextKeyService();
    const values = contextKeyService.getAll();
    const mapKey = values[fileTreeItemMapKey.key];
    return typeof mapKey === "string" ? mapKey : "";
  } catch {
    return "";
  }
}

/**
 * Check if we're in changes mode from context keys.
 */
function isChangesMode(): boolean {
  try {
    const contextKeyService = getContextKeyService();
    const values = contextKeyService.getAll();
    return values[fileTreeChangesMode.key] === true;
  } catch {
    return false;
  }
}

/**
 * Get the cwd from context keys.
 */
function getCwd(): string {
  try {
    const contextKeyService = getContextKeyService();
    const values = contextKeyService.getAll();
    const cwd = values[fileTreeCwd.key];
    return typeof cwd === "string" ? cwd : "";
  } catch {
    return "";
  }
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
  commandRegistry: ICommandRegistry,
): void {
  // ==========================================================================
  // Normal Mode Commands (only shown when NOT in changes mode)
  // ==========================================================================

  // New File - available in both modes, directories only
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
        when: fileTreeItemIsDirectory.isTrue(),
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (!path) return;

      // Route to appropriate callback based on mode
      if (isChangesMode()) {
        fileTreeChangesCallbacks?.onNewFile(path);
      } else {
        fileTreeCallbacks?.onNewFile(path);
      }
    },
  });

  // New Folder - available in both modes, directories only
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
        when: fileTreeItemIsDirectory.isTrue(),
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (!path) return;

      // Route to appropriate callback based on mode
      if (isChangesMode()) {
        fileTreeChangesCallbacks?.onNewFolder(path);
      } else {
        fileTreeCallbacks?.onNewFolder(path);
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
        when: When.or(
          fileTreeChangesMode.isFalse(),
          When.and(
            fileTreeChangesMode.isTrue(),
            fileTreeItemIsStaged.isFalse(),
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
        when: When.or(
          fileTreeChangesMode.isFalse(),
          When.and(
            fileTreeChangesMode.isTrue(),
            fileTreeItemIsStaged.isFalse(),
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
      },
    ],
    run: async () => {
      const path = getTargetPath();
      if (path) {
        await navigator.clipboard.writeText(path);
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
      },
    ],
    run: async () => {
      const path = getTargetPath();
      const cwd = getCwd();
      if (path) {
        const relativePath = getRelativePath(path, cwd);
        await navigator.clipboard.writeText(relativePath);
      }
    },
  });

  // Reveal in Finder/Explorer
  commandRegistry.registerCommand({
    id: FileTreeCommands.REVEAL_IN_FINDER,
    title: getRevealInFinderLabel(),
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
      const path = getTargetPath();
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
