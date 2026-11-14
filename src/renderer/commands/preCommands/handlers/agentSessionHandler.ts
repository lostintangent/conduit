import type { AgentSessionInfo } from "@shared/types";

/**
 * Result of agent session creation
 */
export type AgentSessionHandlerResult =
  | { success: true; session: AgentSessionInfo }
  | { success: false; error: string };

/**
 * Create an agent session (git worktree) for isolated development
 *
 * This handler extracts the core business logic from splitPaneWithAgentSession
 * so it can be reused by both pre-commands and existing functions.
 *
 * @param cwd The working directory where the agent session should be created
 * @returns Result with session info on success, or error message on failure
 */
export async function createAgentSessionHandler(
  cwd: string,
): Promise<AgentSessionHandlerResult> {
  const api = window.conduit;

  try {
    const session = await api.spawnAgentSession({ cwd });

    if (!session) {
      return {
        success: false,
        error: "Failed to spawn agent session: No session returned",
      };
    }

    return {
      success: true,
      session,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide more specific error messages for known error conditions
    if (errorMessage.includes("Unable to find a Git repository")) {
      return {
        success: false,
        error:
          "No Git repository found. Agent sessions require a Git repository to create an isolated worktree.",
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
