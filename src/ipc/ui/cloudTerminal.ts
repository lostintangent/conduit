/**
 * Cloud Terminal feature flag module
 *
 * Checks if the user is a GitHub staff member (site_admin) and has
 * a valid GITHUB_TOKEN to enable cloud terminal functionality.
 */

import { ipcMain } from "electron";

export type CloudTerminalStatus = {
  enabled: boolean;
  reason?: string;
};

let cachedStatus: CloudTerminalStatus | null = null;

/**
 * Check if the current user is a GitHub site admin by calling the GitHub API
 */
async function checkGitHubSiteAdmin(): Promise<CloudTerminalStatus> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return {
      enabled: false,
      reason: "GITHUB_TOKEN environment variable not set",
    };
  }

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Conduit-App",
      },
    });

    if (!response.ok) {
      return {
        enabled: false,
        reason: `GitHub API returned ${response.status}: ${response.statusText}`,
      };
    }

    const user = (await response.json()) as { site_admin?: boolean };

    if (user.site_admin === true) {
      return { enabled: true };
    }

    return {
      enabled: false,
      reason: "User is not a GitHub staff member",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      enabled: false,
      reason: `Failed to check GitHub user: ${message}`,
    };
  }
}

/**
 * Get the cloud terminal enabled status (cached after first check)
 */
export async function getCloudTerminalStatus(): Promise<CloudTerminalStatus> {
  if (cachedStatus !== null) {
    return cachedStatus;
  }

  cachedStatus = await checkGitHubSiteAdmin();
  console.log(
    `[CloudTerminal] Status: ${cachedStatus.enabled ? "enabled" : "disabled"}${cachedStatus.reason ? ` (${cachedStatus.reason})` : ""}`,
  );
  return cachedStatus;
}

/**
 * Clear the cached status (useful for testing or token refresh)
 */
export function clearCloudTerminalStatusCache(): void {
  cachedStatus = null;
}

/**
 * Initialize IPC handlers for cloud terminal status
 */
export function initializeCloudTerminalHandlers(): void {
  ipcMain.handle("ui:get-cloud-terminal-status", async () => {
    return getCloudTerminalStatus();
  });

  ipcMain.handle("ui:refresh-cloud-terminal-status", async () => {
    clearCloudTerminalStatusCache();
    return getCloudTerminalStatus();
  });
}
