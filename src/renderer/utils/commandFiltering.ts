/**
 * Command Filtering using fuzzy scoring
 *
 * This file uses the same fuzzy scoring implementation as file filtering
 * to provide intelligent command search with match highlighting.
 */

import type { Command } from "@/types";
import {
  compareItemsByFuzzyScore,
  prepareQuery,
  scoreItemFuzzy,
  type FuzzyScorerCache,
  type IItemAccessor,
  type IMatch,
} from "./fuzzy-matcher";

export interface CommandMatch {
  id: string;
  label: string;
  description?: string;
  category?: string;
  keybinding?: string;
  score: number;
  labelHighlights: IMatch[];
  descriptionHighlights: IMatch[];
  run: () => Promise<void> | void;
}

/**
 * Accessor for CommandMatch to work with VS Code's scorer
 * Maps command data structure to the IItemAccessor interface
 */
class CommandMatchAccessor implements IItemAccessor<CommandMatch> {
  getItemLabel(item: CommandMatch): string {
    return item.label;
  }

  getItemDescription(item: CommandMatch): string | undefined {
    // Use description if available, fall back to category
    return item.description || item.category;
  }

  getItemPath(item: CommandMatch): string | undefined {
    return item.id;
  }
}

const commandMatchAccessor = new CommandMatchAccessor();

/**
 * Filter and score commands based on fuzzy query
 *
 * @param query - The search query (without the ">" prefix)
 * @param commands - Array of commands to filter
 * @returns Sorted array of matching commands with highlights
 */
export function filterCommands(
  query: string,
  commands: Command[],
): CommandMatch[] {
  // Convert commands to CommandMatch objects
  const commandMatches: CommandMatch[] = commands.map((cmd) => ({
    id: cmd.id,
    label: cmd.label,
    description: cmd.description,
    category: cmd.category,
    keybinding: cmd.keybinding,
    score: 0,
    labelHighlights: [] as IMatch[],
    descriptionHighlights: [] as IMatch[],
    run: cmd.run,
  }));

  // Empty query: return all commands sorted alphabetically by label
  if (!query || query.trim().length === 0) {
    return commandMatches.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Prepare query using VS Code's preparation
  const preparedQuery = prepareQuery(query);

  // Score all commands
  const cache: FuzzyScorerCache = Object.create(null);
  const scoredCommands: CommandMatch[] = [];

  for (const commandMatch of commandMatches) {
    const itemScore = scoreItemFuzzy(
      commandMatch,
      preparedQuery,
      true, // allowNonContiguousMatches
      commandMatchAccessor,
      cache,
    );

    if (itemScore.score > 0) {
      commandMatch.score = itemScore.score;
      commandMatch.labelHighlights = itemScore.labelMatch || [];
      commandMatch.descriptionHighlights = itemScore.descriptionMatch || [];
      scoredCommands.push(commandMatch);
    }
  }

  // Sort using VS Code's comparison function
  scoredCommands.sort((a, b) =>
    compareItemsByFuzzyScore(
      a,
      b,
      preparedQuery,
      true, // allowNonContiguousMatches
      commandMatchAccessor,
      cache,
    ),
  );

  return scoredCommands;
}
