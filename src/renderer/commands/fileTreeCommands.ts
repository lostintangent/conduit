/**
 * File tree command registrations
 *
 * Commands for interacting with the file tree panel:
 * - Open file
 * - Rename
 * - Delete
 * - Copy path
 * - Copy relative path
 * - Reveal in Finder/Explorer
 *
 * These commands are only available via the file tree context menu
 * (not the command palette). They use context keys to determine
 * the target path for operations.
 */

import type { ICommandRegistry } from "@/commands";
import { When, getContextKeyService } from "@/commands";
import {
  fileTreeCwd,
  fileTreeItemIsDirectory,
  fileTreeTargetPath,
} from "@/commands/contextKeys/appContextKeys";
import { MenuId } from "@/commands/menus/types";

/**
 * File tree command IDs
 */
export const FileTreeCommands = {
  NEW_FILE: "fileTree.newFile",
  NEW_FOLDER: "fileTree.newFolder",
  RENAME: "fileTree.rename",
  DELETE: "fileTree.delete",
  COPY_PATH: "fileTree.copyPath",
  COPY_RELATIVE_PATH: "fileTree.copyRelativePath",
  REVEAL_IN_FINDER: "fileTree.revealInFinder",
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

/**
 * Callback registry for file tree commands.
 *
 * Since commands are global but file tree operations are component-local,
 * we use a callback registry that the FileTreeNormal component registers with.
 */
export interface FileTreeCommandCallbacks {
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

let fileTreeCallbacks: FileTreeCommandCallbacks | null = null;

/**
 * Register callbacks for file tree commands.
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
  // New File
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
      if (path && fileTreeCallbacks?.onNewFile) {
        fileTreeCallbacks.onNewFile(path);
      }
    },
  });

  // New Folder
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
      if (path && fileTreeCallbacks?.onNewFolder) {
        fileTreeCallbacks.onNewFolder(path);
      }
    },
  });

  // Rename
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
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (path && fileTreeCallbacks?.onRename) {
        fileTreeCallbacks.onRename(path);
      }
    },
  });

  // Delete
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
      },
    ],
    run: () => {
      const path = getTargetPath();
      if (path && fileTreeCallbacks?.onDelete) {
        fileTreeCallbacks.onDelete(path);
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
}
