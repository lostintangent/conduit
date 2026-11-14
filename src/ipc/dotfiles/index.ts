/**
 * Dotfiles IPC module.
 *
 * Manages syncing a user's dotfiles repository to their home directory.
 * Features:
 * - Auto-discovery of existing "dotfiles" repo via GitHub CLI
 * - Cloning and symlinking dotfiles to home directory
 * - Watching for local changes and auto-pushing
 * - Polling for remote changes
 *
 * Safety: Symlink logic never overwrites existing files or symlinks.
 * Users can clear the setting to remove all symlinks and the cloned repo.
 */

import { BrowserWindow, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { SimpleGit } from "simple-git";
import type { DotfilesStatus } from "../../shared/types/settings";
import { createGit } from "../git/createGit";
import {
  createDotfilesRepo as createRepo,
  discoverDotfilesRepo,
  normalizeDotfilesRepo,
} from "./gh";
import { cloneRepo, fetchAndPull, getRemoteUrl, repoExists } from "./git";
import { removeSymlinks } from "./symlinks";
import { startSync, stopSync } from "./sync";

let repoUrl: string | undefined;
let repoPath: string;
let status: DotfilesStatus = "disabled";

let homeDirectory: string;
let window: BrowserWindow;
let git: SimpleGit;

function updateStatus(newStatus: DotfilesStatus): void {
  status = newStatus;

  if (window && !window.isDestroyed()) {
    window.webContents.send("dotfiles:status-changed", newStatus);
  }
}

async function deleteRepo(): Promise<void> {
  try {
    await removeSymlinks(repoPath, homeDirectory);
    await fs.rm(repoPath, { recursive: true, force: true });
  } catch (error) {
    console.error("Failed to delete repo:", error);
  }
}

// ============================================================================
// Module API
// ============================================================================

/**
 * Initializes the dotfiles module: sets up state and registers IPC handlers.
 * Must be called before any other dotfiles functions.
 */
export function initialize(
  conduitStateDirectory: string,
  home: string,
  win: BrowserWindow,
): void {
  repoPath = path.join(conduitStateDirectory, "dotfiles");
  homeDirectory = home;
  window = win;
  git = createGit();

  // Register IPC handlers
  ipcMain.handle("dotfiles:get-path", () => repoPath);
  ipcMain.handle("dotfiles:get-status", () => status);

  ipcMain.handle("dotfiles:create-repo", async () => {
    try {
      const url = await createRepo();
      await setDotfilesRepo(url);
      return url;
    } catch (error) {
      console.error("Failed to create dotfiles repo:", error);
      throw error;
    }
  });

  ipcMain.handle("dotfiles:fetch", async () => {
    if (!repoUrl) {
      throw new Error("No dotfiles repository configured");
    }
    await fetchAndPull(git, status, updateStatus, repoPath, homeDirectory);
  });

  ipcMain.handle("dotfiles:add-file", async (_event, filePath: string) => {
    const relativePath = path.relative(homeDirectory, filePath);
    const destPath = path.join(repoPath, relativePath);

    // Ensure parent directory exists in repo
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    // Move the file to the dotfiles repo
    // The file watcher will automatically create the symlink back
    await fs.rename(filePath, destPath);
  });
}

/**
 * Initializes dotfiles with an optional pre-configured repo URL.
 * If no URL is provided, attempts to auto-discover a dotfiles repo.
 * Returns the discovered URL if auto-discovery found one.
 *
 * Auto-discovery is safe because our symlink logic:
 * - Never overwrites existing files
 * - Never replaces symlinks pointing elsewhere
 * - Only creates symlinks where nothing exists
 *
 * Users can clear the setting to remove the repo and all symlinks.
 */
export async function initializeRepo(
  initialRepoUrl?: string,
): Promise<string | undefined> {
  if (initialRepoUrl) {
    await setDotfilesRepo(initialRepoUrl);
    return undefined;
  }

  // Check if user has a dotfiles repo on GitHub
  const suggestedRepo = await discoverDotfilesRepo();
  if (suggestedRepo) {
    await setDotfilesRepo(suggestedRepo);
    return suggestedRepo;
  }

  updateStatus("disabled");
  return undefined;
}

/**
 * Sets the dotfiles repository URL.
 * Handles cloning, syncing, and setting up watchers.
 * Supports both full URLs and owner/repo syntax.
 */
export async function setDotfilesRepo(url: string | undefined): Promise<void> {
  const normalizedUrl = url ? normalizeDotfilesRepo(url) : undefined;

  // No change needed - compare normalized values to avoid unnecessary reclones
  if (repoUrl === normalizedUrl) return;

  repoUrl = normalizedUrl;
  await stopSync();

  // Disable if URL is cleared or invalid
  if (!normalizedUrl) {
    await deleteRepo();
    updateStatus("disabled");
    return;
  }

  // Clone if repo doesn't exist, otherwise check if remote changed
  const exists = await repoExists(repoPath);
  const needsClone =
    !exists ||
    normalizeDotfilesRepo(await getRemoteUrl(repoPath)) !== normalizedUrl;

  if (needsClone) {
    await deleteRepo();
    git = await cloneRepo(
      normalizedUrl,
      repoPath,
      homeDirectory,
      git,
      updateStatus,
    );
  } else {
    // Repo exists with matching remote - sync latest changes
    git = createGit(repoPath);
    await fetchAndPull(git, status, updateStatus, repoPath, homeDirectory);
  }

  await startSync(repoPath, homeDirectory, git, () => status, updateStatus);
}
