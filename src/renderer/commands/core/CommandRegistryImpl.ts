import type { ICommandRegistry } from './CommandRegistry';
import type { CommandDescriptor, CommandContext, Disposable } from './types';
import type { IContextKeyService } from '../contextKeys/ContextKeyService';

/**
 * Implementation of the command registry
 */
export class CommandRegistry implements ICommandRegistry {
  private commands = new Map<string, CommandDescriptor>();

  constructor(private contextKeyService: IContextKeyService) {}

  registerCommand<TContext extends CommandContext = CommandContext>(
    descriptor: CommandDescriptor<TContext>
  ): Disposable {
    // Validate command ID is unique
    if (this.commands.has(descriptor.id)) {
      console.warn(`Command ${descriptor.id} is already registered. Overwriting.`);
    }

    // Store command
    this.commands.set(descriptor.id, descriptor as CommandDescriptor);

    // TODO Phase 4: Register keybindings
    // TODO Phase 5: Register menu contributions

    // Return disposable
    return {
      dispose: () => {
        this.commands.delete(descriptor.id);
        // TODO: Cleanup keybindings and menus
      }
    };
  }

  async executeCommand<T = void>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
    const descriptor = this.commands.get(commandId);
    if (!descriptor) {
      console.error(`Command ${commandId} not found`);
      return undefined;
    }

    // Check when clause
    if (descriptor.when) {
      const contextValues = this.contextKeyService.getAll();
      if (!descriptor.when.evaluate(contextValues)) {
        console.warn(`Command ${commandId} is disabled by when clause`);
        return undefined;
      }
    }

    // Build command context
    const context = this.buildContext();

    // Execute command
    try {
      const result = await descriptor.run(context, ...args);
      return result as T;
    } catch (error) {
      console.error(`Error executing command ${commandId}:`, error);
      throw error;
    }
  }

  getCommand(commandId: string): CommandDescriptor | undefined {
    return this.commands.get(commandId);
  }

  getAllCommands(): CommandDescriptor[] {
    return Array.from(this.commands.values());
  }

  hasCommand(commandId: string): boolean {
    return this.commands.has(commandId);
  }

  private buildContext(): CommandContext {
    // TODO: Build real context from services
    // For now, return minimal context
    return {
      tabs: null as any,
      panes: null as any,
      terminals: null as any,
      workspaces: null as any,
      commands: null as any,
      dialogs: null as any,
      notifications: null as any,
      settings: null as any,
      contextKeys: this.contextKeyService,
      activeTab: null,
      activePaneId: null,
      workspaceName: undefined
    };
  }
}
