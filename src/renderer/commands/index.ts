import { CommandRegistry } from './core/CommandRegistryImpl';
import { ContextKeyService } from './contextKeys/ContextKeyServiceImpl';
import { KeybindingRegistry } from './keybindings/KeybindingRegistry';
import type { ICommandRegistry } from './core/CommandRegistry';
import type { IContextKeyService } from './contextKeys/ContextKeyService';
import type { CommandContext, CommandDescriptor } from './core/types';

export { CommandRegistry } from './core/CommandRegistryImpl';
export { ContextKeyService } from './contextKeys/ContextKeyServiceImpl';
export { KeybindingRegistry } from './keybindings/KeybindingRegistry';
export { When } from './whenClauses/When';
export { useKeybindingDispatch } from './keybindings/useKeybindingDispatch';

export type { CommandDescriptor, CommandContext } from './core/types';
export type { WhenClause } from './whenClauses/WhenClause';
export type { ICommandRegistry } from './core/CommandRegistry';
export type { IContextKeyService } from './contextKeys/ContextKeyService';
export type { KeybindingDescriptor, KeyChord, ResolvedKeybinding } from './keybindings/types';

// Global instances (to be initialized in app startup)
let commandRegistry: ICommandRegistry | null = null;
let contextKeyService: IContextKeyService | null = null;
let keybindingRegistry: KeybindingRegistry | null = null;

export function initializeCommandSystem() {
  contextKeyService = new ContextKeyService();
  keybindingRegistry = new KeybindingRegistry();
  commandRegistry = new CommandRegistry(contextKeyService, keybindingRegistry);
}

export function getCommandRegistry(): ICommandRegistry {
  if (!commandRegistry) {
    throw new Error('Command system not initialized. Call initializeCommandSystem() first.');
  }
  return commandRegistry;
}

export function getContextKeyService(): IContextKeyService {
  if (!contextKeyService) {
    throw new Error('Command system not initialized. Call initializeCommandSystem() first.');
  }
  return contextKeyService;
}

export function getKeybindingRegistry(): KeybindingRegistry {
  if (!keybindingRegistry) {
    throw new Error('Command system not initialized. Call initializeCommandSystem() first.');
  }
  return keybindingRegistry;
}

// Convenience functions
export function registerCommand<TContext extends CommandContext = CommandContext>(
  descriptor: CommandDescriptor<TContext>
) {
  return getCommandRegistry().registerCommand(descriptor);
}

export function executeCommand<T = void>(commandId: string, ...args: unknown[]) {
  return getCommandRegistry().executeCommand<T>(commandId, ...args);
}
