import { useMemo, useState, useEffect } from "react";
import { useSelector } from "@tanstack/react-store";
import type { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import type { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import type { ContextValues } from "@/commands/contextKeys/types";
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
 * @param contextKeyService - Context key service instance (can be undefined during initialization)
 * @returns Array of commands with simplified interface for display and execution (empty if registries not ready)
 */
export function useCommands(
  commandRegistry: CommandRegistry | undefined,
  contextKeyService: ContextKeyService | undefined,
): Command[] {
  // Context values as of the last change. Until one fires, the memo below
  // reads them from the service.
  const [changedContext, setChangedContext] = useState<ContextValues>();

  useEffect(() => {
    if (!contextKeyService) return;

    return contextKeyService.onDidChangeContext(() => {
      setChangedContext(contextKeyService.getAll());
    });
  }, [contextKeyService]);

  // Track keybinding changes via atom (already reactive)
  const keybindingsMap = useSelector(keybindingsAtom);

  return useMemo(() => {
    // Return empty array if registries not ready
    if (!commandRegistry || !contextKeyService) {
      return [];
    }

    const allCommands = commandRegistry.getAllCommands();
    const contextValues = changedContext ?? contextKeyService.getAll();

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
      const primaryKeybinding = keybindingsMap.get(cmd.id)?.[0]; // Use first binding

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
  }, [commandRegistry, contextKeyService, changedContext, keybindingsMap]);
}
