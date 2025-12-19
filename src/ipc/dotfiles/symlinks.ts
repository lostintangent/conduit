/**
 * Symlink management for dotfiles.
 * Handles creating and removing symlinks between the repo and home directory.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

const MAX_CLEANUP_DEPTH = 4;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a path is a symlink pointing to a specific target.
 */
async function isSymlinkTo(
  linkPath: string,
  targetPath: string,
): Promise<boolean> {
  try {
    const stats = await fs.lstat(linkPath);
    if (!stats.isSymbolicLink()) return false;
    const linkTarget = await fs.readlink(linkPath);
    return linkTarget === targetPath;
  } catch {
    return false;
  }
}

/**
 * Checks if a symlink points somewhere inside the given directory.
 */
async function isSymlinkInto(
  linkPath: string,
  directoryPath: string,
): Promise<boolean> {
  try {
    const stats = await fs.lstat(linkPath);
    if (!stats.isSymbolicLink()) return false;
    const linkTarget = await fs.readlink(linkPath);
    return (
      linkTarget.startsWith(directoryPath + path.sep) ||
      linkTarget === directoryPath
    );
  } catch {
    return false;
  }
}

/**
 * Checks if any parent directory of destPath is a symlink pointing into repoPath.
 */
async function isParentSymlinkedToRepo(
  destPath: string,
  repoPath: string,
  homeDirectory: string,
): Promise<boolean> {
  let current = path.dirname(destPath);

  while (current.length >= homeDirectory.length && current !== homeDirectory) {
    if (await isSymlinkInto(current, repoPath)) {
      return true;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Synchronizes symlinks between the dotfiles repo and home directory.
 *
 * This is the main entry point for symlink management. It:
 * 1. Removes broken symlinks (handles deletions/renames from remote)
 * 2. Creates/updates symlinks (handles additions from remote)
 *
 * Safe to call on both initial clone and subsequent fetches.
 */
export async function synchronizeSymlinks(
  repoPath: string,
  homeDirectory: string,
): Promise<void> {
  await cleanupBrokenSymlinks(repoPath, homeDirectory);
  await createSymlinks(repoPath, homeDirectory);
}

/**
 * Removes all symlinks that point to the dotfiles repository.
 * Used when clearing the dotfiles repo from settings.
 */
export async function removeSymlinks(
  repoPath: string,
  homeDirectory: string,
): Promise<void> {
  let items: string[];
  try {
    items = await fs.readdir(repoPath);
  } catch {
    return;
  }

  for (const item of items) {
    if (item === ".git") continue;

    const sourcePath = path.join(repoPath, item);
    const destPath = path.join(homeDirectory, item);

    try {
      const destStats = await fs.lstat(destPath);

      if (await isSymlinkTo(destPath, sourcePath)) {
        await fs.unlink(destPath);
      } else if (destStats.isDirectory()) {
        const sourceStats = await fs.lstat(sourcePath);
        if (sourceStats.isDirectory()) {
          await removeSymlinks(sourcePath, destPath);
        }
      }
    } catch {
      // Dest doesn't exist, nothing to remove
    }
  }
}

/**
 * Syncs a single symlink when a file is created/deleted in the repo.
 *
 * Note: This only handles direct symlinks. If a parent directory is already
 * symlinked to the repo, the new file is automatically visible and no action
 * is needed (nor should we create a nested symlink).
 */
export async function syncSymlink(
  repoPath: string,
  homeDirectory: string,
  filePath: string,
  remove = false,
): Promise<void> {
  if (!filePath.startsWith(repoPath)) return;

  const relativePath = path.relative(repoPath, filePath);
  const destPath = path.join(homeDirectory, relativePath);

  if (remove) {
    if (await isSymlinkTo(destPath, filePath)) {
      await fs.unlink(destPath);
    }
    return;
  }

  // If a parent is already symlinked to our repo, file is auto-visible
  if (await isParentSymlinkedToRepo(destPath, repoPath, homeDirectory)) {
    return;
  }

  try {
    // Check if destination already exists
    await fs.lstat(destPath);
    return; // Exists, don't overwrite
  } catch {
    // Doesn't exist, proceed
  }

  try {
    const sourceStats = await fs.lstat(filePath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.symlink(
      filePath,
      destPath,
      sourceStats.isDirectory() ? "junction" : "file",
    );
  } catch (err) {
    console.warn(`Failed to sync symlink for ${relativePath}:`, err);
  }
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Creates symlinks from repo to home directory, recursively merging with
 * existing directories.
 */
export async function createSymlinks(
  sourceDir: string,
  destDir: string,
): Promise<void> {
  let items: string[];
  try {
    items = await fs.readdir(sourceDir);
  } catch {
    return;
  }

  for (const item of items) {
    if (item === ".git") continue;

    const source = path.join(sourceDir, item);
    const dest = path.join(destDir, item);

    try {
      const sourceStats = await fs.lstat(source);
      let destStats = null;

      try {
        destStats = await fs.lstat(dest);
      } catch {
        // Dest doesn't exist
      }

      if (destStats) {
        if (destStats.isSymbolicLink()) {
          // Replace symlink if it points elsewhere
          if (!(await isSymlinkTo(dest, source))) {
            await fs.unlink(dest);
            await fs.symlink(
              source,
              dest,
              sourceStats.isDirectory() ? "junction" : "file",
            );
          }
        } else if (destStats.isDirectory() && sourceStats.isDirectory()) {
          // Both are real directories, recurse to merge
          await createSymlinks(source, dest);
        } else {
          // Conflict: existing file, skip to preserve user data
          console.warn(
            `Skipping symlink for ${item}: already exists and is not a symlink/mergeable dir`,
          );
        }
      } else {
        // Dest doesn't exist, create symlink
        await fs.symlink(
          source,
          dest,
          sourceStats.isDirectory() ? "junction" : "file",
        );
      }
    } catch (err) {
      console.warn(`Failed to process symlink for ${item}:`, err);
    }
  }
}

/**
 * Scans home directory for broken symlinks pointing into the repo and removes them.
 * Limited to MAX_CLEANUP_DEPTH levels to avoid scanning the entire filesystem.
 */
async function cleanupBrokenSymlinks(
  repoPath: string,
  currentDir: string,
  depth = 0,
): Promise<void> {
  if (depth >= MAX_CLEANUP_DEPTH) return;

  let items: string[];
  try {
    items = await fs.readdir(currentDir);
  } catch {
    return;
  }

  for (const item of items) {
    const itemPath = path.join(currentDir, item);

    try {
      const stats = await fs.lstat(itemPath);

      if (stats.isSymbolicLink()) {
        if (await isSymlinkInto(itemPath, repoPath)) {
          const target = await fs.readlink(itemPath);
          try {
            await fs.access(target);
          } catch {
            // Target doesn't exist - broken symlink, remove it
            await fs.unlink(itemPath);
          }
        }
        // Don't recurse into symlinked directories
      } else if (stats.isDirectory()) {
        await cleanupBrokenSymlinks(repoPath, itemPath, depth + 1);
      }
    } catch {
      // Skip items we can't access
    }
  }
}
