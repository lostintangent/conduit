import type { CommandDescriptor, CommandContext, Disposable } from './types';

/**
 * Registry for all commands in the system
 */
export interface ICommandRegistry {
  /**
   * Register a command
   * @returns Disposable to unregister the command
   */
  registerCommand<TContext extends CommandContext = CommandContext>(
    descriptor: CommandDescriptor<TContext>
  ): Disposable;

  /**
   * Execute a command by ID
   */
  executeCommand<T = void>(commandId: string, ...args: unknown[]): Promise<T | undefined>;

  /**
   * Get a command descriptor by ID
   */
  getCommand(commandId: string): CommandDescriptor | undefined;

  /**
   * Get all registered commands
   */
  getAllCommands(): CommandDescriptor[];

  /**
   * Check if a command exists
   */
  hasCommand(commandId: string): boolean;

  /**
   * Set the context builder function to provide real app state
   */
  setContextBuilder(builder: () => CommandContext): void;
}
