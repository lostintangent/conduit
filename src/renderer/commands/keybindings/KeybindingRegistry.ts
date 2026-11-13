import type { KeybindingDescriptor, ResolvedKeybinding } from "./types";
import { parseKeybinding, matchesEvent } from "./parser";

/**
 * Registry for keyboard shortcuts
 */
export class KeybindingRegistry {
  private keybindings: ResolvedKeybinding[] = [];

  /**
   * Register a keybinding for a command
   */
  register(
    commandId: string,
    descriptor: KeybindingDescriptor,
    weight = 0,
  ): void {
    const chords = parseKeybinding(descriptor.key);

    // Store resolved keybinding
    this.keybindings.push({
      commandId,
      chords,
      weight,
    });
  }

  /**
   * Find matching command for a keyboard event
   */
  findCommand(event: KeyboardEvent, chordIndex = 0): string | undefined {
    // Find all keybindings that match this event at the current chord index
    const matches = this.keybindings.filter((kb) => {
      if (kb.chords.length <= chordIndex) return false;
      return matchesEvent(kb.chords[chordIndex], event);
    });

    if (matches.length === 0) return undefined;

    // Sort by weight (higher weight = higher priority)
    matches.sort((a, b) => b.weight - a.weight);

    // Return highest priority match
    return matches[0].commandId;
  }

  /**
   * Check if there are any keybindings that start with this chord
   */
  hasChordContinuation(event: KeyboardEvent, chordIndex = 0): boolean {
    return this.keybindings.some((kb) => {
      if (kb.chords.length <= chordIndex + 1) return false;
      return matchesEvent(kb.chords[chordIndex], event);
    });
  }

  /**
   * Get all keybindings for a command
   */
  getKeybindingsForCommand(commandId: string): ResolvedKeybinding[] {
    return this.keybindings.filter((kb) => kb.commandId === commandId);
  }

  /**
   * Get all keybindings grouped by command ID
   */
  getAllKeybindings(): Map<string, ResolvedKeybinding[]> {
    const map = new Map<string, ResolvedKeybinding[]>();

    for (const binding of this.keybindings) {
      const existing = map.get(binding.commandId) ?? [];
      existing.push(binding);
      map.set(binding.commandId, existing);
    }

    return map;
  }

  /**
   * Unregister all keybindings for a command
   */
  unregister(commandId: string): void {
    this.keybindings = this.keybindings.filter(
      (kb) => kb.commandId !== commandId,
    );
  }

  /**
   * Clear all keybindings
   */
  clear(): void {
    this.keybindings = [];
  }
}
