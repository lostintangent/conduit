import type { ICommandRegistry } from '@/commands/core/CommandRegistry';
import type { KeybindingRegistry } from '@/commands/keybindings/KeybindingRegistry';
import type { IContextKeyService } from '@/commands/contextKeys/ContextKeyService';
import { formatKeybindingForDisplay } from '@/commands/keybindings/utils';
import type { Command } from '@/types';

/**
 * General-purpose hook that converts registered commands to simple Command type
 *
 * This hook provides a simplified view of the command registry for UI components
 * that need to display or execute commands. It handles:
 * - Fetching all commands from the registry
 * - Filtering by when clause evaluation (dynamic visibility)
 * - Filtering out meta commands (view.showCommandPalette)
 * - Mapping keybindings to display format
 * - Wrapping execution to call commandRegistry.executeCommand()
 *
 * Common use cases:
 * - Command palettes and quick pick menus
 * - Context menus and dropdowns
 * - Toolbar buttons and command lists
 *
 * Note: This hook recomputes on every render to ensure fresh data from registries.
 * The registries are designed to be fast to query, so this is acceptable.
 *
 * @param commandRegistry - Command registry instance
 * @param keybindingRegistry - Keybinding registry instance
 * @param contextKeyService - Context key service instance
 * @returns Array of commands with simplified interface for display and execution
 */
export function useCommands(
  commandRegistry: ICommandRegistry,
  keybindingRegistry: KeybindingRegistry,
  contextKeyService: IContextKeyService
): Command[] {
  const allCommands = commandRegistry.getAllCommands();
  const contextValues = contextKeyService.getAll();

  // Filter by when clause
  const availableCommands = allCommands.filter(cmd => {
    if (!cmd.when) return true;
    return cmd.when.evaluate(contextValues);
  });

  // Filter out meta commands (like showing the palette itself)
  const filteredCommands = availableCommands.filter(cmd =>
    cmd.id !== 'view.showCommandPalette'
  );

  // Convert CommandDescriptor → Command
  return filteredCommands.map(cmd => {
    // Get keybinding for this command
    const keybindings = keybindingRegistry.getKeybindingsForCommand(cmd.id);
    const primaryKeybinding = keybindings[0]; // Use first binding

    // Format keybinding for display
    const keybindingString = primaryKeybinding
      ? formatKeybindingForDisplay(primaryKeybinding.chords)
      : undefined;

    return {
      id: cmd.id,
      label: cmd.title,
      description: cmd.description,
      category: cmd.category,
      keybinding: keybindingString,
      run: () => {
        // Adapter: hide context parameter from Command interface
        return commandRegistry.executeCommand(cmd.id);
      }
    };
  });
}
