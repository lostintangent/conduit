import { CommandRegistry } from "./core/CommandRegistryImpl";
import { ContextKeyService } from "./contextKeys/ContextKeyServiceImpl";
import { KeybindingRegistry } from "./keybindings/KeybindingRegistry";
import { MenuRegistry } from "./menus/MenuRegistry";

export { CommandRegistry } from "./core/CommandRegistryImpl";
export { ContextKeyService } from "./contextKeys/ContextKeyServiceImpl";
export { KeybindingRegistry } from "./keybindings/KeybindingRegistry";
export { When } from "./whenClauses/When";

// Global instances shared by the app
const contextKeyService = new ContextKeyService();
const keybindingRegistry = new KeybindingRegistry();
const menuRegistry = new MenuRegistry();
const commandRegistry = new CommandRegistry(
  contextKeyService,
  keybindingRegistry,
  menuRegistry,
);

export const getCommandRegistry = () => commandRegistry;
export const getContextKeyService = () => contextKeyService;
export const getKeybindingRegistry = () => keybindingRegistry;
export const getMenuRegistry = () => menuRegistry;

export function executeCommand<T = void>(
  commandId: string,
  ...args: unknown[]
) {
  return commandRegistry.executeCommand<T>(commandId, ...args);
}
