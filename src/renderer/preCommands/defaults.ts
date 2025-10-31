import { PreCommandRegistry } from "./registry";

/**
 * Register default pre-commands
 * This will be populated in Phase 3 with actual pre-command implementations
 */
export function registerDefaultPreCommands(): void {
  const registry = PreCommandRegistry.getInstance();

  // TODO: Phase 3 - Register default pre-commands here
  // - verifyGitRepo
  // - createAgentSession

  console.log("[PreCommands] Default pre-commands registered");
}
