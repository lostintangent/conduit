import { CommandRegistry } from './core/CommandRegistryImpl';
import { ContextKeyService } from './contextKeys/ContextKeyServiceImpl';
import { KeybindingRegistry } from './keybindings/KeybindingRegistry';
import { MenuRegistry } from './menus/MenuRegistry';
import type { ICommandRegistry } from './core/CommandRegistry';
import type { IContextKeyService } from './contextKeys/ContextKeyService';
import type { CommandContext, CommandDescriptor } from './core/types';

export { CommandRegistry } from './core/CommandRegistryImpl';
export { ContextKeyService } from './contextKeys/ContextKeyServiceImpl';
export { KeybindingRegistry } from './keybindings/KeybindingRegistry';
export { MenuRegistry } from './menus/MenuRegistry';
export { When } from './whenClauses/When';
export { useKeybindingDispatch } from './keybindings/useKeybindingDispatch';
export { useMenu } from './menus/useMenu';
export { useCommandPaletteData } from './commandPalette/useCommandPaletteData';
export { loadUserKeybindings } from './keybindings/userKeybindings';
export { watchKeybindingsFile } from './keybindings/watchKeybindings';
export { parseKeybindingsFile, isRemovalBinding, getRemovalCommandId } from './keybindings/keybindingsFile';

export type { CommandDescriptor, CommandContext } from './core/types';
export type { WhenClause } from './whenClauses/WhenClause';
export type { ICommandRegistry } from './core/CommandRegistry';
export type { IContextKeyService } from './contextKeys/ContextKeyService';
export type { KeybindingDescriptor, KeyChord, ResolvedKeybinding } from './keybindings/types';
export type { MenuId, MenuContribution, MenuItem } from './menus/types';
export type { MenuItemData } from './menus/useMenu';
export type { CommandPaletteItem } from './commandPalette/useCommandPaletteData';
export type { UserKeybinding } from './keybindings/keybindingsFile';

// Global instances (to be initialized in app startup)
let commandRegistry: ICommandRegistry | null = null;
let contextKeyService: IContextKeyService | null = null;
let keybindingRegistry: KeybindingRegistry | null = null;
let menuRegistry: MenuRegistry | null = null;

export function initializeCommandSystem() {
  contextKeyService = new ContextKeyService();
  keybindingRegistry = new KeybindingRegistry();
  menuRegistry = new MenuRegistry();
  commandRegistry = new CommandRegistry(contextKeyService, keybindingRegistry, menuRegistry);
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

export function getMenuRegistry(): MenuRegistry {
  if (!menuRegistry) {
    throw new Error('Command system not initialized. Call initializeCommandSystem() first.');
  }
  return menuRegistry;
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
