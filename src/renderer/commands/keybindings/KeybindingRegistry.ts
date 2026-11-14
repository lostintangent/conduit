import type {
  KeybindingDescriptor,
  KeyChord,
  ResolvedKeybinding,
} from "./types";
import { chordOf, isSameChord, matchesEvent, parseKeybinding } from "./parser";

/** A key that starts a keybinding, and what pressing it does */
export interface FirstChord {
  chord: KeyChord;
  /** The keybinding that runs for it, unless it starts a chord */
  binding: ResolvedKeybinding;
  /** Whether a keybinding has a second part after it, like Cmd+K Cmd+S */
  startsChord: boolean;
}

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
   * Find the command for a key, or for the second part of a chord that
   * `chordStart` began
   */
  findCommand(
    event: KeyboardEvent,
    chordStart?: KeyboardEvent,
  ): string | undefined {
    if (!chordStart) {
      return this.resolve((kb) => matchesEvent(kb.chords[0], event))?.commandId;
    }

    const start = chordOf(chordStart);
    return this.resolveChord(
      (chord) => isSameChord(chord, start),
      (chord) => matchesEvent(chord, event),
    )?.commandId;
  }

  /**
   * The two-part keybindings that run, one for each key sequence, resolved as
   * findCommand resolves them from the keyboard
   */
  getChordBindings(): ResolvedKeybinding[] {
    const winners = new Set<ResolvedKeybinding>();
    for (const { chords } of this.keybindings) {
      if (chords.length !== 2) continue;
      const winner = this.resolveChord(
        (chord) => isSameChord(chord, chords[0]),
        (chord) => isSameChord(chord, chords[1]),
      );
      if (winner) winners.add(winner);
    }
    return [...winners];
  }

  /**
   * Each key a keybinding starts with, and what pressing it does: wait for a
   * second part if any keybinding has one, or else run the keybinding
   * findCommand picks for it
   */
  getFirstChords(): FirstChord[] {
    const firstChords: FirstChord[] = [];
    for (const {
      chords: [chord],
    } of this.keybindings) {
      if (firstChords.some((first) => isSameChord(first.chord, chord))) {
        continue;
      }
      const startsWith = (kb: ResolvedKeybinding) =>
        isSameChord(kb.chords[0], chord);
      firstChords.push({
        chord,
        binding: this.resolve(startsWith) as ResolvedKeybinding,
        startsChord: this.keybindings.some(
          (kb) => startsWith(kb) && kb.chords.length > 1,
        ),
      });
    }
    return firstChords;
  }

  private resolveChord(
    isStart: (chord: KeyChord) => boolean,
    isEnd: (chord: KeyChord) => boolean,
  ): ResolvedKeybinding | undefined {
    return this.resolve(
      (kb) =>
        kb.chords.length > 1 && isStart(kb.chords[0]) && isEnd(kb.chords[1]),
    );
  }

  /**
   * Of the keybindings that match, the one that runs: the highest weight,
   * then the first registered
   */
  private resolve(
    matches: (kb: ResolvedKeybinding) => boolean,
  ): ResolvedKeybinding | undefined {
    let winner: ResolvedKeybinding | undefined;
    for (const kb of this.keybindings) {
      if (matches(kb) && (!winner || kb.weight > winner.weight)) {
        winner = kb;
      }
    }
    return winner;
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
