/**
 * Git operations for the dotfiles repository.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { SimpleGit } from "simple-git";
import type { DotfilesStatus } from "../model";
import { createGit } from "@features/git/main/createGit";
import { createSymlinks, synchronizeSymlinks } from "./symlinks";

/**
 * Checks if the dotfiles repository exists locally.
 */
export async function repoExists(repoPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the remote URL of the local repository.
 */
export async function getRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const git = createGit(repoPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    return origin?.refs.fetch || null;
  } catch {
    return null;
  }
}

/**
 * Clones a dotfiles repository.
 */
export async function cloneRepo(
  url: string,
  repoPath: string,
  homeDirectory: string,
  git: SimpleGit,
  updateStatus: (status: DotfilesStatus) => void,
): Promise<SimpleGit> {
  updateStatus("cloning");

  try {
    await fs.mkdir(repoPath, { recursive: true });
    await git.clone(url, repoPath);
    const newGit = createGit(repoPath);
    await createSymlinks(repoPath, homeDirectory);
    updateStatus("idle");
    return newGit;
  } catch (error) {
    console.error("Failed to clone repo:", error);
    updateStatus("failed");
    return git;
  }
}

/**
 * Fetches and pulls the latest changes from the remote.
 * After pulling, synchronizes symlinks (cleans up broken + creates new).
 */
export async function fetchAndPull(
  git: SimpleGit,
  status: DotfilesStatus,
  updateStatus: (status: DotfilesStatus) => void,
  repoPath?: string,
  homeDirectory?: string,
): Promise<void> {
  if (status === "cloning" || status === "pushing") {
    return;
  }

  updateStatus("fetching");

  try {
    await git.fetch();
    await git.pull();

    // Synchronize symlinks: cleanup broken ones + create new ones
    if (repoPath && homeDirectory) {
      await synchronizeSymlinks(repoPath, homeDirectory);
    }

    updateStatus("idle");
  } catch (error) {
    console.error("Failed to fetch/pull:", error);
    updateStatus("failed");
  }
}

/**
 * Commits and pushes any local changes.
 */
export async function commitAndPush(
  git: SimpleGit,
  updateStatus: (status: DotfilesStatus) => void,
): Promise<void> {
  try {
    const status = await git.status();
    if (!status.isClean()) {
      updateStatus("pushing");
      await git.add(".");
      await git.commit("Auto-update from Conduit");
      await git.push();
      updateStatus("idle");
    }
  } catch (error) {
    console.error("Failed to auto-commit/push:", error);
    updateStatus("failed");
  }
}
