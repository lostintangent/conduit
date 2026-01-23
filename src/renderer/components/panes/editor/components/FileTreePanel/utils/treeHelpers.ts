/**
 * Tree building and manipulation utilities for FileTreePanel.
 */

import type { GitFileStatus } from "@/api/GitV2API";
import type { SelectableItem, FolderNode, FileEntry } from "./types";

/**
 * Get the directory path from a file path.
 * Returns empty string for root-level files.
 */
export function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
}

/**
 * Build a nested tree structure from a flat list of file paths.
 * Groups files by their directory hierarchy.
 *
 * Note: The input `files` array contains [mapKey, status] tuples where:
 * - mapKey is the git status Map key (may include suffix for partially staged files)
 * - status.path is the actual file path (no suffix)
 */
export function buildFolderTree(
  files: Array<[string, GitFileStatus]>,
): Map<string, FolderNode> {
  const rootFolders = new Map<string, FolderNode>();

  for (const [mapKey, status] of files) {
    // Use actual file path for folder navigation and display
    const actualPath = status.path;
    const parts = actualPath.split("/");
    const fileName = parts.pop()!;

    // Navigate/create folder structure
    let currentLevel = rootFolders;
    let currentPath = "";

    for (const folderName of parts) {
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      if (!currentLevel.has(folderName)) {
        currentLevel.set(folderName, {
          name: folderName,
          path: currentPath,
          files: [],
          folders: new Map(),
        });
      }

      const folder = currentLevel.get(folderName)!;
      currentLevel = folder.folders;
    }

    // Create file entry with both mapKey and actual path
    const fileEntry = {
      mapKey,
      path: actualPath,
      name: fileName,
      status,
    };

    // Add file to appropriate location
    if (parts.length === 0) {
      // Root level file - create a virtual "root" folder
      if (!rootFolders.has("")) {
        rootFolders.set("", {
          name: "",
          path: "",
          files: [],
          folders: new Map(),
        });
      }
      rootFolders.get("")!.files.push(fileEntry);
    } else {
      // Navigate back to the correct folder and add file
      let parentLevel = rootFolders;
      for (let i = 0; i < parts.length - 1; i++) {
        parentLevel = parentLevel.get(parts[i])!.folders;
      }
      const parentFolder = parentLevel.get(parts[parts.length - 1])!;
      parentFolder.files.push(fileEntry);
    }
  }

  return rootFolders;
}

/**
 * Build visual order list from folder tree (depth-first traversal).
 * Includes both files and folders in the order they appear in the tree.
 *
 * @param tree - The folder tree from buildFolderTree
 * @param expandedFolders - Set of currently expanded folder paths
 * @returns Array of selectable items in visual display order
 */
export function buildVisualOrderFromTree(
  tree: Map<string, FolderNode>,
  expandedFolders: Set<string>,
): SelectableItem[] {
  const result: SelectableItem[] = [];

  // Get root-level files
  const rootFolder = tree.get("");
  const rootFiles = rootFolder?.files ?? [];

  // Get top-level folders
  const folders = [...tree.values()]
    .filter((f) => f.name !== "")
    .sort((a, b) => a.name.localeCompare(b.name));

  // Recursive function to traverse folder
  function traverseFolder(folder: FolderNode) {
    // Add folder itself
    result.push({ path: folder.path, type: "folder" });

    // If expanded, add children
    if (expandedFolders.has(folder.path)) {
      // Subfolders first
      const sortedSubfolders = [...folder.folders.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const subfolder of sortedSubfolders) {
        traverseFolder(subfolder);
      }

      // Then files
      const sortedFiles = [...folder.files].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const file of sortedFiles) {
        // Use mapKey for multi-select tracking (handles partially staged files)
        result.push({ path: file.mapKey, type: "file" });
      }
    }
  }

  // Traverse top-level folders
  for (const folder of folders) {
    traverseFolder(folder);
  }

  // Add root-level files
  for (const file of rootFiles.sort((a, b) => a.name.localeCompare(b.name))) {
    // Use mapKey for multi-select tracking (handles partially staged files)
    result.push({ path: file.mapKey, type: "file" });
  }

  return result;
}

/**
 * Expand folder paths to their contained file paths.
 * When a folder is selected, this returns all files within that folder.
 *
 * @param selectedPaths - Set of selected paths (may include folders)
 * @param allFilePaths - All file paths in the tree
 * @returns Array of file paths (no folders)
 */
export function expandFoldersToFiles(
  selectedPaths: Set<string>,
  allFilePaths: string[],
): string[] {
  const result = new Set<string>();

  for (const path of selectedPaths) {
    // Check if any file path starts with this path + "/"
    // If so, this is a folder selection
    const isFolder = allFilePaths.some(
      (fp) => fp.startsWith(path + "/") && fp !== path,
    );

    if (isFolder) {
      // Add all files under this folder
      for (const filePath of allFilePaths) {
        if (filePath.startsWith(path + "/") || filePath === path) {
          result.add(filePath);
        }
      }
    } else {
      // It's a file, add directly
      result.add(path);
    }
  }

  return Array.from(result);
}

/**
 * Build visual order for flat view mode.
 * Simply converts file paths to SelectableItems.
 *
 * @param stagedFiles - Array of [path, status] for staged files
 * @param unstagedFiles - Array of [path, status] for unstaged files
 * @returns Array of selectable items in display order
 */
export function buildFlatVisualOrder(
  stagedFiles: Array<[string, GitFileStatus]>,
  unstagedFiles: Array<[string, GitFileStatus]>,
): SelectableItem[] {
  return [
    ...stagedFiles.map(([path]) => ({ path, type: "file" as const })),
    ...unstagedFiles.map(([path]) => ({ path, type: "file" as const })),
  ];
}
