import { useSelector } from "@tanstack/react-store";
import { useCallback } from "react";
import { keybindingsAtom } from "@/store/atoms";
import { getCommandRegistry, executeCommand } from "@/commands";
import { formatKeybindingForDisplay } from "../keybindings/utils";
import type { KeyChord } from "../keybindings/types";

export interface CommandKeybinding {
  /** The formatted display string (e.g., "⌘⌥F" or "Ctrl+Alt+F") */
  display: string;
  /** The raw chords for programmatic access */
  chords: KeyChord[];
  /** Priority weight (higher = more important, user overrides = 1000) */
  weight: number;
}

export interface CommandInfo {
  /** The command's human-readable title */
  title: string;
  /** All keybindings for this command, sorted by priority (highest first) */
  keybindings: CommandKeybinding[];
  /** The primary (highest priority) keybinding display string, or null if none */
  primaryKeybinding: string | null;
  /** Execute the command */
  execute: () => Promise<void>;
  /** Whether the command is disabled (command not found) */
  disabled: boolean;
}

/**
 * Format a command's display title with optional keybinding hint
 *
 * @param cmd - Command info from useCommand hook
 * @param showKeybinding - Whether to include the keybinding in the title
 * @returns Formatted title string
 *
 * @example
 * const cmd = useCommand(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE);
 * getCommandDisplayTitle(cmd)  // → "Toggle Focus Mode (⌘⌥F)"
 * getCommandDisplayTitle(cmd, false)  // → "Toggle Focus Mode"
 */
export function getCommandDisplayTitle(
  cmd: Pick<CommandInfo, "title" | "primaryKeybinding">,
  showKeybinding = true,
): string {
  if (showKeybinding && cmd.primaryKeybinding) {
    return `${cmd.title} (${cmd.primaryKeybinding})`;
  }
  return cmd.title;
}

/**
 * Hook to access command metadata and keybindings
 *
 * This hook provides reactive access to command information including:
 * - Title and metadata from the command registry
 * - Resolved keybindings (including user overrides) from the keybindings atom
 * - Automatic sorting by weight to prioritize user overrides
 *
 * @param commandId - The unique command identifier
 * @returns Command information including keybindings and execute function
 *
 * @example
 * const cmd = useCommand(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE);
 *
 * <button
 *   title={getCommandDisplayTitle(cmd)}
 *   aria-label={cmd.title}
 *   onClick={cmd.execute}
 *   disabled={cmd.disabled}
 * >
 *   <Expand size={18} />
 * </button>
 */
export function useCommand(commandId: string): CommandInfo {
  const keybindingsMap = useSelector(keybindingsAtom);
  // Null until the command is registered
  const command = getCommandRegistry().getCommand(commandId) ?? null;
  const rawBindings = keybindingsMap.get(commandId) ?? [];

  // Sort by weight (highest first)
  // This ensures user overrides (weight 1000) come before defaults (weight 0)
  const sortedBindings = [...rawBindings].sort((a, b) => b.weight - a.weight);

  const keybindings: CommandKeybinding[] = sortedBindings.map((binding) => ({
    display: formatKeybindingForDisplay(binding.chords),
    chords: binding.chords,
    weight: binding.weight,
  }));

  const execute = useCallback(async () => {
    if (!command) {
      console.warn(
        `Cannot execute command "${commandId}": command system not ready or command not found`,
      );
      return;
    }
    await executeCommand(commandId);
  }, [commandId, command]);

  return {
    title: command?.title ?? "",
    keybindings,
    primaryKeybinding: keybindings[0]?.display ?? null,
    execute,
    disabled: !command,
  };
}
