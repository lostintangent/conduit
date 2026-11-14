/**
 * Dotfiles sync.
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

import { app } from "electron";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { SimpleGit } from "simple-git";
import { emitter } from "../../../ipc/events";
import { createGit } from "../../../ipc/git/createGit";
import type { DotfilesStatus } from "../model";
import {
  createDotfilesRepo,
  discoverDotfilesRepo,
  normalizeDotfilesRepo,
} from "./gh";
import { cloneRepo, fetchAndPull, getRemoteUrl, repoExists } from "./git";
import { removeSymlinks } from "./symlinks";
import { startSync, stopSync } from "./sync";

const emit = emitter("dotfiles");

let repoUrl: string | null | undefined;
let status: DotfilesStatus = "disabled";

// Created on first use rather than at import, which runs before main.ts
// hydrates the login shell's environment.
let git: SimpleGit | undefined;
const currentGit = () => (git ??= createGit());

const homeDirectory = () => app.getPath("home");

export function getRepoPath(): string {
  return path.join(homeDirectory(), ".conduit", "dotfiles");
}

export function getStatus(): DotfilesStatus {
  return status;
}

function updateStatus(newStatus: DotfilesStatus): void {
  status = newStatus;
  emit("statusChanged", newStatus);
}

async function deleteRepo(): Promise<void> {
  try {
    await removeSymlinks(getRepoPath(), homeDirectory());
    await fs.rm(getRepoPath(), { recursive: true, force: true });
  } catch (error) {
    console.error("Failed to delete repo:", error);
  }
}

// ============================================================================
// Module API
// ============================================================================

/** Creates a "dotfiles" repo on the user's GitHub account and syncs it. */
export async function createRepo(): Promise<string> {
  try {
    const url = await createDotfilesRepo();
    await setDotfilesRepo(url);
    return url;
  } catch (error) {
    console.error("Failed to create dotfiles repo:", error);
    throw error;
  }
}

/** Pulls the latest changes from the configured repo. */
export async function fetch(): Promise<void> {
  if (!repoUrl) {
    throw new Error("No dotfiles repository configured");
  }
  await fetchAndPull(
    currentGit(),
    status,
    updateStatus,
    getRepoPath(),
    homeDirectory(),
  );
}

/**
 * Moves a file from the home directory into the repo. The repo's file watcher
 * then creates the symlink back.
 */
export async function addFile(filePath: string): Promise<void> {
  const relativePath = path.relative(homeDirectory(), filePath);
  const destPath = path.join(getRepoPath(), relativePath);

  // Ensure parent directory exists in repo
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.rename(filePath, destPath);
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

  const repoPath = getRepoPath();
  const home = homeDirectory();

  // Clone if repo doesn't exist, otherwise check if remote changed. An
  // unreadable origin fails rather than recloning, which would delete the repo.
  const exists = await repoExists(repoPath);
  const remoteUrl = exists ? await getRemoteUrl(repoPath) : null;
  if (exists && !remoteUrl) {
    throw new Error(`Couldn't read the origin remote of ${repoPath}`);
  }
  const needsClone =
    !remoteUrl || normalizeDotfilesRepo(remoteUrl) !== normalizedUrl;

  if (needsClone) {
    await deleteRepo();
    git = await cloneRepo(
      normalizedUrl,
      repoPath,
      home,
      currentGit(),
      updateStatus,
    );
  } else {
    // Repo exists with matching remote - sync latest changes
    git = createGit(repoPath);
    await fetchAndPull(git, status, updateStatus, repoPath, home);
  }

  await startSync(repoPath, home, git, () => status, updateStatus);
}
