/**
 * Cloud Terminal Pre-Command Handler
 *
 * Detects if the current directory is a GitHub repository and automatically
 * configures cloud terminal creation with the detected repo info.
 *
 * If changes are detected (uncommitted or unpushed), creates a diff patch
 * and applies it to the VM after the repository is cloned.
 */

import type { PreCommandResult } from "../types";

export interface CloudTerminalHandlerResult {
  success: boolean;
  githubRepo?: {
    owner: string;
    name: string;
    branch: string;
    branchExistsOnRemote: boolean;
    defaultBranch: string;
  };
  localRepoCwd?: string;
  diffPatches?: {
    staged: Buffer | null;
    unstaged: Buffer | null;
    untracked: Buffer | null;
  };
  error?: string;
}

/**
 * Detects GitHub repository information from the current working directory
 * and creates a diff patch if there are local changes
 *
 * If a GitHub repo is detected, returns the owner/name/branch so cloud terminal
 * can clone it automatically. If there are uncommitted or unpushed changes,
 * creates a diff patch that will be applied to the VM.
 *
 * @param cwd - Current working directory
 * @returns Handler result with optional GitHub repo info and diff patch
 */
export async function detectGitHubRepoHandler(
  cwd: string,
): Promise<CloudTerminalHandlerResult> {
  const api = window.conduit;

  try {
    // Check if we're in a git repository
    const hasRepo = await api.hasGitRepository(cwd);

    if (!hasRepo) {
      // Not in a git repo - that's fine, will show dialog
      return { success: true };
    }

    // Get GitHub repo info (owner/name/branch)
    const repoInfo = await api.getGitHubRepoInfo(cwd);

    if (!repoInfo) {
      // Has git repo but not a GitHub repo (e.g., GitLab, Bitbucket, local)
      // Still success, will show dialog
      console.log("[CloudTerminal] Git repository found but not a GitHub repo");
      return { success: true };
    }

    // Found GitHub repo! Check for local changes
    console.log("[CloudTerminal] Detected GitHub repo:", repoInfo);

    if (!repoInfo.branchExistsOnRemote) {
      console.log(
        `[CloudTerminal] Local branch "${repoInfo.branch}" doesn't exist on remote`,
      );
      console.log(
        `[CloudTerminal] VM will clone "${repoInfo.defaultBranch}" and create local branch`,
      );
    }

    const [hasUncommitted, hasUnpushed] = await Promise.all([
      api.hasUncommittedChanges(cwd),
      api.hasUnpushedCommits(cwd),
    ]);

    let localRepoCwd: string | undefined;
    let diffPatches:
      | {
          staged: Buffer | null;
          unstaged: Buffer | null;
          untracked: Buffer | null;
        }
      | undefined;

    // Store local repo path for SSH push if there are unpushed commits
    if (hasUnpushed) {
      console.log(
        "[CloudTerminal] Unpushed commits detected, will push via SSH",
      );
      localRepoCwd = cwd;
    }

    // Create diff patches for working tree changes (preserving staging state)
    if (hasUncommitted) {
      console.log(
        "[CloudTerminal] Uncommitted changes detected, creating patches...",
      );

      const patches = await api.createDiffPatch(cwd);

      if (patches) {
        diffPatches = {
          staged: patches.stagedPatch,
          unstaged: patches.unstagedPatch,
          untracked: patches.untrackedPatch,
        };
        const parts = [];
        if (patches.stagedPatch)
          parts.push(`staged: ${patches.stagedPatch.length}b`);
        if (patches.unstagedPatch)
          parts.push(`unstaged: ${patches.unstagedPatch.length}b`);
        if (patches.untrackedPatch)
          parts.push(`untracked: ${patches.untrackedPatch.length}b`);
        console.log(`[CloudTerminal] Created patches: ${parts.join(", ")}`);
      } else {
        console.warn(
          "[CloudTerminal] Failed to create patches despite detected changes",
        );
      }
    }

    if (!hasUncommitted && !hasUnpushed) {
      console.log("[CloudTerminal] No local changes detected");
    }

    return {
      success: true,
      githubRepo: repoInfo,
      localRepoCwd,
      diffPatches,
    };
  } catch (error) {
    // If anything goes wrong, just treat as no repo found
    // This ensures we don't block cloud terminal creation
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[CloudTerminal] Failed to detect GitHub repo:", errorMessage);
    return { success: true };
  }
}

/**
 * Transform handler result into pre-command result with paneOptions
 *
 * @param handlerResult - Result from detectGitHubRepoHandler
 * @param isRemoteVM - Whether this should be a cloud terminal
 * @returns Pre-command result with cloud terminal options
 */
export function buildCloudTerminalResult(
  handlerResult: CloudTerminalHandlerResult,
  isRemoteVM = true,
): PreCommandResult {
  if (!handlerResult.success) {
    return {
      success: false,
      error: handlerResult.error,
    };
  }

  // Build terminal options with cloud VM flag
  const terminalOptions: any = {
    isRemoteVM,
  };

  // Add GitHub repo info if detected
  if (handlerResult.githubRepo) {
    terminalOptions.githubRepo = handlerResult.githubRepo;
    console.log(
      `[CloudTerminal] Including GitHub repo: ${handlerResult.githubRepo.owner}/${handlerResult.githubRepo.name}`,
    );
  }

  // Add local repo path if there are unpushed commits (for SSH push)
  if (handlerResult.localRepoCwd) {
    terminalOptions.localRepoCwd = handlerResult.localRepoCwd;
    console.log(
      `[CloudTerminal] Will push commits from: ${handlerResult.localRepoCwd}`,
    );
  }

  // Add working tree patches if there are uncommitted changes
  if (handlerResult.diffPatches) {
    terminalOptions.diffPatches = handlerResult.diffPatches;
    const parts = [];
    if (handlerResult.diffPatches.staged)
      parts.push(`staged: ${handlerResult.diffPatches.staged.length}b`);
    if (handlerResult.diffPatches.unstaged)
      parts.push(`unstaged: ${handlerResult.diffPatches.unstaged.length}b`);
    if (handlerResult.diffPatches.untracked)
      parts.push(`untracked: ${handlerResult.diffPatches.untracked.length}b`);
    console.log(
      `[CloudTerminal] Including working tree patches: ${parts.join(", ")}`,
    );
  }

  if (!handlerResult.localRepoCwd && !handlerResult.diffPatches) {
    console.log(`[CloudTerminal] No local changes to sync`);
  }

  return {
    success: true,
    paneOptions: {
      terminalOptions,
    },
  };
}
