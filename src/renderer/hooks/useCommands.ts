import { useMemo, useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import type { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import type { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";
import type { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import { formatKeybindingForDisplay } from "@/commands/keybindings/utils";
import { keybindingsAtom } from "@/store/atoms";
import type { Command } from "@/types";

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
 * Reactivity:
 * - Recomputes when context keys change (via onDidChangeContext subscription)
 * - Recomputes when keybindings change (via keybindingsAtom)
 * - Memoized to avoid unnecessary recalculation
 *
 * @param commandRegistry - Command registry instance (can be undefined during initialization)
 * @param keybindingRegistry - Keybinding registry instance (can be undefined during initialization)
 * @param contextKeyService - Context key service instance (can be undefined during initialization)
 * @returns Array of commands with simplified interface for display and execution (empty if registries not ready)
 */
export function useCommands(
  commandRegistry: CommandRegistry | undefined,
  keybindingRegistry: KeybindingRegistry | undefined,
  contextKeyService: ContextKeyService | undefined,
): Command[] {
  // Track context key changes via subscription
  const [contextRevision, setContextRevision] = useState(0);

  useEffect(() => {
    if (!contextKeyService) return;

    // Subscribe to context key changes
    const unsubscribe = contextKeyService.onDidChangeContext(() => {
      setContextRevision((prev) => prev + 1);
    });
    return unsubscribe;
  }, [contextKeyService]);

  // Track keybinding changes via atom (already reactive)
  const keybindingsMap = useAtomValue(keybindingsAtom);

  return useMemo(() => {
    // Return empty array if registries not ready
    if (!commandRegistry || !keybindingRegistry || !contextKeyService) {
      return [];
    }

    const allCommands = commandRegistry.getAllCommands();
    const contextValues = contextKeyService.getAll();

    // Filter by when clause
    const availableCommands = allCommands.filter((cmd) => {
      if (!cmd.when) return true;
      return cmd.when.evaluate(contextValues);
    });

    // Filter out meta commands (like showing the palette itself)
    const filteredCommands = availableCommands.filter(
      (cmd) => cmd.id !== "view.showCommandPalette",
    );

    // Convert CommandDescriptor → Command
    return filteredCommands.map((cmd) => {
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
        },
      };
    });
  }, [
    commandRegistry,
    keybindingRegistry,
    contextKeyService,
    contextRevision,
    keybindingsMap,
  ]);
}
