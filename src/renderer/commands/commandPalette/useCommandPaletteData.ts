import { useMemo } from "react";
import type { ICommandRegistry } from "../core/CommandRegistry";
import type { IContextKeyService } from "../contextKeys/ContextKeyService";

/**
 * Command palette item for display
 */
export interface CommandPaletteItem {
  id: string;
  title: string;
  category?: string;
  icon?: string;
  enabled: boolean;
  whenClause?: string;
}

/**
 * Hook for getting filtered command palette items
 */
export function useCommandPaletteData(
  commandRegistry: ICommandRegistry,
  contextKeyService: IContextKeyService,
  searchQuery: string,
): CommandPaletteItem[] {
  return useMemo(() => {
    const allCommands = commandRegistry.getAllCommands();
    const contextValues = contextKeyService.getAll();

    // Filter by when clause
    const availableCommands = allCommands.filter((cmd) => {
      if (!cmd.when) return true;
      return cmd.when.evaluate(contextValues);
    });

    // Filter by search query
    const filteredCommands = searchQuery
      ? availableCommands.filter((cmd) => {
          const searchLower = searchQuery.toLowerCase();
          const titleMatch = cmd.title.toLowerCase().includes(searchLower);
          const categoryMatch = cmd.category
            ?.toLowerCase()
            .includes(searchLower);
          return titleMatch || categoryMatch;
        })
      : availableCommands;

    // Map to command palette items
    const items: CommandPaletteItem[] = filteredCommands.map((cmd) => ({
      id: cmd.id,
      title: cmd.title,
      category: cmd.category,
      icon: cmd.icon,
      enabled: true,
      whenClause: cmd.when?.toString(),
    }));

    // Sort by category, then title
    items.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || "").localeCompare(b.category || "");
      }
      return a.title.localeCompare(b.title);
    });

    return items;
  }, [commandRegistry, contextKeyService, searchQuery]);
}
