import type { PreCommand, PreCommandResult, TerminalConfig } from "./types";

/**
 * Singleton registry for pre-commands
 * Manages registration and execution of pre-commands
 */
export class PreCommandRegistry {
  private static instance: PreCommandRegistry | null = null;
  private commands: Map<string, PreCommand> = new Map();

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): PreCommandRegistry {
    if (!PreCommandRegistry.instance) {
      PreCommandRegistry.instance = new PreCommandRegistry();
    }
    return PreCommandRegistry.instance;
  }

  /**
   * Register a pre-command
   * @param command The pre-command to register
   */
  register(command: PreCommand): void {
    if (this.commands.has(command.id)) {
      console.warn(`[PreCommands] Overwriting existing pre-command: ${command.id}`);
    }
    this.commands.set(command.id, command);
  }

  /**
   * Get a pre-command by ID
   * @param id The pre-command ID
   * @returns The pre-command or undefined if not found
   */
  get(id: string): PreCommand | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all registered pre-commands
   * @returns Array of all pre-commands
   */
  getAll(): PreCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Execute a pre-command by ID
   * @param id The pre-command ID to execute
   * @param terminalConfig The terminal configuration
   * @returns The result of the pre-command execution
   */
  async execute(
    id: string,
    terminalConfig: TerminalConfig
  ): Promise<PreCommandResult> {
    const command = this.commands.get(id);

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

  /**
   * Clear all registered pre-commands (useful for testing)
   */
  clear(): void {
    this.commands.clear();
  }
}
