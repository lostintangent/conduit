import { CommandRegistry } from "./core/CommandRegistryImpl";
import { ContextKeyService } from "./contextKeys/ContextKeyServiceImpl";
import { KeybindingRegistry } from "./keybindings/KeybindingRegistry";
import { MenuRegistry } from "./menus/MenuRegistry";

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
export type {
  KeybindingDescriptor,
  KeyChord,
  ResolvedKeybinding,
} from "./keybindings/types";
export type { MenuId, MenuContribution, MenuItem } from "./menus/types";
export type { UserKeybinding } from "./keybindings/keybindingsFile";

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
