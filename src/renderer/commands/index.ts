import { CommandRegistry } from "./core/CommandRegistryImpl";
import { ContextKeyService } from "./contextKeys/ContextKeyServiceImpl";
import { KeybindingRegistry } from "./keybindings/KeybindingRegistry";
import { MenuRegistry } from "./menus/MenuRegistry";
import type { ICommandRegistry } from "./core/CommandRegistry";
import type { CommandContext, CommandDescriptor } from "./core/types";

export { CommandRegistry } from "./core/CommandRegistryImpl";
export { ContextKeyService } from "./contextKeys/ContextKeyServiceImpl";
export { KeybindingRegistry } from "./keybindings/KeybindingRegistry";
export { MenuRegistry } from "./menus/MenuRegistry";
export { When } from "./whenClauses/When";
export {
  useKeybindingDispatch,
  type KeybindingDispatchOptions,
} from "./hooks/useKeybindingDispatch";
export { loadUserKeybindings } from "./keybindings/userKeybindings";
export { watchKeybindingsFile } from "./keybindings/watchKeybindings";
export {
  parseKeybindingsFile,
  isRemovalBinding,
  getRemovalCommandId,
} from "./keybindings/keybindingsFile";

export type { CommandDescriptor, CommandContext } from "./core/types";
export type { WhenClause } from "./whenClauses/WhenClause";
export type { ICommandRegistry } from "./core/CommandRegistry";
export type {
  KeybindingDescriptor,
  KeyChord,
  ResolvedKeybinding,
} from "./keybindings/types";
export type { MenuId, MenuContribution, MenuItem } from "./menus/types";
export type { UserKeybinding } from "./keybindings/keybindingsFile";

// Global instances (to be initialized in app startup)
let commandRegistry: ICommandRegistry | null = null;
let contextKeyService: ContextKeyService | null = null;
let keybindingRegistry: KeybindingRegistry | null = null;
let menuRegistry: MenuRegistry | null = null;

export function initializeCommandSystem() {
  // Only initialize once - subsequent calls are no-ops
  if (commandRegistry) {
    return;
  }

  contextKeyService = new ContextKeyService();
  keybindingRegistry = new KeybindingRegistry();
  menuRegistry = new MenuRegistry();
  commandRegistry = new CommandRegistry(
    contextKeyService,
    keybindingRegistry,
    menuRegistry,
  );
}

/**
 * Reset the command system for testing purposes only.
 * This resets all registries and allows re-initialization.
 * @internal
 */
export function _resetCommandSystem(): void {
  commandRegistry = null;
  contextKeyService = null;
  keybindingRegistry = null;
  menuRegistry = null;
}

export function getCommandRegistry(): ICommandRegistry {
  if (!commandRegistry) {
    throw new Error(
      "Command system not initialized. Call initializeCommandSystem() first.",
    );
  }
  return commandRegistry;
}

export function getContextKeyService(): ContextKeyService {
  if (!contextKeyService) {
    throw new Error(
      "Command system not initialized. Call initializeCommandSystem() first.",
    );
  }
  return contextKeyService;
}

export function getKeybindingRegistry(): KeybindingRegistry {
  if (!keybindingRegistry) {
    throw new Error(
      "Command system not initialized. Call initializeCommandSystem() first.",
    );
  }
  return keybindingRegistry;
}

export function getMenuRegistry(): MenuRegistry {
  if (!menuRegistry) {
    throw new Error(
      "Command system not initialized. Call initializeCommandSystem() first.",
    );
  }
  return menuRegistry;
}

// Non-throwing getters for use in hooks (return null if not initialized)
export function tryGetCommandRegistry(): ICommandRegistry | null {
  return commandRegistry;
}

export function tryGetKeybindingRegistry(): KeybindingRegistry | null {
  return keybindingRegistry;
}

// Convenience functions
export function registerCommand<
  TContext extends CommandContext = CommandContext,
>(descriptor: CommandDescriptor<TContext>) {
  return getCommandRegistry().registerCommand(descriptor);
}

export function executeCommand<T = void>(
  commandId: string,
  ...args: unknown[]
) {
  return getCommandRegistry().executeCommand<T>(commandId, ...args);
}
