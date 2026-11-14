import { createAgentSessionHandler } from "./handlers/agentSessionHandler";
import { verifyGitRepoHandler } from "./handlers/gitRepoHandler";
import type { PreCommand, PreCommandResult, TerminalConfig } from "./types";

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
    let cwd: string | null | undefined = terminalConfig.cwd;
    if (!cwd) {
      const settings = await api.settings.get();
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
    let cwd: string | null | undefined = terminalConfig.cwd;
    if (!cwd) {
      const settings = await api.settings.get();
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
          cwd: result.session.worktreePath,
        },
      },
    };
  },
};

export const preCommands: PreCommand[] = [verifyGitRepo, createAgentSession];

export async function runPreCommand(
  id: string,
  terminalConfig: TerminalConfig,
): Promise<PreCommandResult> {
  const command = preCommands.find((preCommand) => preCommand.id === id);

  if (!command) {
    return {
      success: false,
      error: `Pre-command not found: ${id}`,
    };
  }

  try {
    return await command.run(terminalConfig);
  } catch (error) {
    console.error(`[PreCommands] Error executing pre-command "${id}":`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
