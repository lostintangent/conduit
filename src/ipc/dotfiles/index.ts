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
import simpleGit, { SimpleGit } from "simple-git";
import type { DotfilesStatus } from "../../shared/types/settings";
import { createDotfilesRepo as createRepo, discoverDotfilesRepo } from "./gh";
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
  git = simpleGit();

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
 */
export async function setDotfilesRepo(url: string | undefined): Promise<void> {
  if (repoUrl === url) return;
  repoUrl = url;

  // Clean up existing sync
  await stopSync();

  if (!url) {
    await deleteRepo();
    updateStatus("disabled");
    return;
  }

  // Check if repo already exists and matches remote
  const exists = await repoExists(repoPath);
  if (exists) {
    const remote = await getRemoteUrl(repoPath);
    if (remote !== url) {
      // Remote changed, re-clone
      await deleteRepo();
      git = await cloneRepo(url, repoPath, homeDirectory, git, updateStatus);
    } else {
      // Exists and matches, just fetch/pull (which re-symlinks)
      git = simpleGit(repoPath);
      await fetchAndPull(git, status, updateStatus, repoPath, homeDirectory);
    }
  } else {
    git = await cloneRepo(url, repoPath, homeDirectory, git, updateStatus);
  }

  // Start bidirectional sync
  await startSync(repoPath, homeDirectory, git, () => status, updateStatus);
}
