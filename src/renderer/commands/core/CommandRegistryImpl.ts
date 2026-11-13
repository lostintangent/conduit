import type { CommandDescriptor, CommandContext, Disposable } from "./types";
import type { ContextKeyService } from "../contextKeys/ContextKeyServiceImpl";
import type { KeybindingRegistry } from "../keybindings/KeybindingRegistry";
import type { MenuRegistry } from "../menus/MenuRegistry";

/**
 * Implementation of the command registry
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDescriptor>();

  constructor(
    private contextKeyService: ContextKeyService,
    private keybindingRegistry?: KeybindingRegistry,
    private menuRegistry?: MenuRegistry,
  ) {}

  registerCommand<TContext extends CommandContext = CommandContext>(
    descriptor: CommandDescriptor<TContext>,
  ): Disposable {
    // Validate command ID is unique
    if (this.commands.has(descriptor.id)) {
      console.warn(
        `Command ${descriptor.id} is already registered. Overwriting.`,
      );
    }

    // Store command
    this.commands.set(descriptor.id, descriptor as CommandDescriptor);

    // Register keybindings
    if (this.keybindingRegistry && descriptor.keybinding) {
      const bindings = Array.isArray(descriptor.keybinding)
        ? descriptor.keybinding
        : [descriptor.keybinding];

      for (const binding of bindings) {
        this.keybindingRegistry.register(descriptor.id, binding);
      }
    }

    // Register menu contributions
    if (this.menuRegistry && descriptor.menu) {
      const menus = Array.isArray(descriptor.menu)
        ? descriptor.menu
        : [descriptor.menu];

      for (const menu of menus) {
        this.menuRegistry.register(descriptor.id, menu);
      }
    }

    // Return disposable
    return {
      dispose: () => {
        this.commands.delete(descriptor.id);

        // Cleanup keybindings
        if (this.keybindingRegistry) {
          this.keybindingRegistry.unregister(descriptor.id);
        }

        // Cleanup menus
        if (this.menuRegistry) {
          this.menuRegistry.unregister(descriptor.id);
        }
      },
    };
  }

  async executeCommand<T = void>(
    commandId: string,
    ...args: unknown[]
  ): Promise<T | undefined> {
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

  isCommandEnabled(commandId: string): boolean {
    const descriptor = this.commands.get(commandId);
    if (!descriptor) {
      return false;
    }

    if (!descriptor.when) {
      return true;
    }

    const contextValues = this.contextKeyService.getAll();
    return descriptor.when.evaluate(contextValues);
  }

  private contextBuilder?: () => CommandContext;

  /**
   * Set the context builder function
   * This should be called during app initialization to provide real state
   */
  setContextBuilder(builder: () => CommandContext): void {
    this.contextBuilder = builder;
  }

  private buildContext(): CommandContext {
    if (this.contextBuilder) {
      return this.contextBuilder();
    }

    // Fallback to minimal context if no builder set
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
      view: null as any,
      workspace: null as any,
      agent: null as any,
      activeTab: null,
      activePaneId: null,
      workspaceName: undefined,
      allTabs: [],
    };
  }
}
