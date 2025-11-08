import { createAgentSessionHandler } from "./handlers/agentSessionHandler";
import { verifyGitRepoHandler } from "./handlers/gitRepoHandler";
import { PreCommandRegistry } from "./registry";
import type { PreCommand } from "./types";

/**
 * Verify Git Repository Pre-Command
 *
 * Validates that the working directory is inside a git repository
 * before executing terminal commands that require git.
 */
export const verifyGitRepo: PreCommand = {
  id: "verify-git-repo",
  label: "Verify Git Repository",
  description: "Checks that the working directory is inside a git repository",

  run: async (terminalConfig) => {
    const api = window.conduit;

    // Determine cwd from config or fallback to home directory
    let cwd = terminalConfig.cwd;
    if (!cwd) {
      const settings = await api.getSettings();
      cwd = settings.homeDirectory;
    }

    if (!cwd) {
      return {
        success: false,
        error: "No working directory specified",
      };
    }

    // Delegate to handler
    const result = await verifyGitRepoHandler(cwd);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return { success: true };
  },
};

/**
 * Create Agent Session Pre-Command
 *
 * Spawns a git worktree for isolated agent development before opening
 * the terminal. This allows multiple agents to work in parallel without
 * conflicts.
 */
export const createAgentSession: PreCommand = {
  id: "create-agent-session",
  label: "Create Agent Session",
  description: "Spawns a git worktree for isolated agent development",

  run: async (terminalConfig) => {
    const api = window.conduit;

    // Determine cwd from config or fallback to home directory
    let cwd = terminalConfig.cwd;
    if (!cwd) {
      const settings = await api.getSettings();
      cwd = settings.homeDirectory;
    }

    if (!cwd) {
      return {
        success: false,
        error: "No working directory specified",
      };
    }

    // Delegate to handler
    const result = await createAgentSessionHandler(cwd);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Transform handler result into pre-command result with paneOptions
    return {
      success: true,
      paneOptions: {
        agentSession: result.session,
        terminalOptions: {
          cwd: result.session!.worktreePath,
        },
      },
    };
  },
};

/**
 * Detect GitHub Repo for Cloud Terminal Pre-Command
 *
 * Automatically detects if the current directory is a GitHub repository
 * and configures cloud terminal to clone it. If no GitHub repo is found,
 * the cloud terminal dialog will be shown as normal.
 */
export const detectGitHubRepoForCloud: PreCommand = {
  id: "detect-github-repo-for-cloud",
  label: "Detect GitHub Repo (Cloud Terminal)",
  description:
    "Automatically clones the current GitHub repository into a cloud VM",

  run: async (terminalConfig) => {
    const api = window.conduit;

    // Determine cwd from config or fallback to home directory
    let cwd = terminalConfig.cwd;
    if (!cwd) {
      const settings = await api.getSettings();
      cwd = settings.homeDirectory;
    }

    if (!cwd) {
      // No cwd available - cloud terminal will show dialog
      return {
        success: true,
        paneOptions: {
          terminalOptions: {
            isRemoteVM: true,
          },
        },
      };
    }

    // Import handler
    const { detectGitHubRepoHandler, buildCloudTerminalResult } = await import(
      "./handlers/cloudTerminalHandler"
    );

    // Detect GitHub repo info
    const result = await detectGitHubRepoHandler(cwd);

    // Build cloud terminal options
    return buildCloudTerminalResult(result, true);
  },
};

/**
 * Register all default pre-commands
 *
 * This function should be called once at application startup to register
 * all built-in pre-commands with the registry.
 */
export function registerDefaultPreCommands(): void {
  const registry = PreCommandRegistry.getInstance();

  registry.register(verifyGitRepo);
  registry.register(createAgentSession);
  registry.register(detectGitHubRepoForCloud);

  console.log("[PreCommands] Default pre-commands registered:", {
    verifyGitRepo: verifyGitRepo.id,
    createAgentSession: createAgentSession.id,
    detectGitHubRepoForCloud: detectGitHubRepoForCloud.id,
  });
}
