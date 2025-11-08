/**
 * Cloud Terminal Pre-Command Handler
 *
 * Detects if the current directory is a GitHub repository and automatically
 * configures cloud terminal creation with the detected repo info.
 */

import type { PreCommandResult } from "../types";

export interface CloudTerminalHandlerResult {
  success: boolean;
  githubRepo?: {
    owner: string;
    name: string;
    branch: string;
  };
  error?: string;
}

/**
 * Detects GitHub repository information from the current working directory
 *
 * If a GitHub repo is detected, returns the owner/name/branch so cloud terminal
 * can clone it automatically. If no repo is found, returns success without
 * repo info (allows fallback to dialog).
 *
 * @param cwd - Current working directory
 * @returns Handler result with optional GitHub repo info
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

    // Found GitHub repo! Return the info
    console.log("[CloudTerminal] Detected GitHub repo:", repoInfo);
    return {
      success: true,
      githubRepo: repoInfo,
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
  }

  return {
    success: true,
    paneOptions: {
      terminalOptions,
    },
  };
}
