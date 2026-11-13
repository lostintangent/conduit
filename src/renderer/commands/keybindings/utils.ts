import type { KeyChord, ResolvedKeybinding } from "./types";

/**
 * Normalize a keybinding (array of chords) to a canonical string for comparison
 *
 * **Purpose**: Creates platform-independent strings for conflict detection and keybinding equality checks.
 *
 * **Why not use formatKeybindingForDisplay?**
 * - formatKeybindingForDisplay produces different output per platform (e.g., "⌘K" on Mac vs "Ctrl+K" on Windows)
 * - This would break conflict detection since "⌘K" !== "Ctrl+K" even though they represent the same logical binding
 * - normalizeKeybinding always produces the same output regardless of platform, making comparisons reliable
 *
 * **Key characteristics**:
 * - Platform-independent (always returns same format)
 * - Uses text labels (Ctrl, Alt, Shift, Cmd) not symbols
 * - Always uses "+" as separator
 * - No special symbols for keys (ArrowUp stays "ArrowUp", not "↑")
 *
 * @example
 * // Same input produces same output on all platforms
 * normalizeKeybinding([{ meta: true, key: "k" }])
 * // → "Cmd+K" (on Mac, Windows, Linux - always identical)
 *
 * @example
 * // Multi-chord keybinding
 * normalizeKeybinding([{ ctrl: true, key: "k" }, { ctrl: true, key: "w" }])
 * // → "Ctrl+K Ctrl+W"
 */
export function normalizeKeybinding(chords: KeyChord[]): string {
  return chords
    .map((chord) => {
      const parts: string[] = [];

      // Add modifiers in consistent order
      if (chord.ctrl) parts.push("Ctrl");
      if (chord.alt) parts.push("Alt");
      if (chord.shift) parts.push("Shift");
      if (chord.meta) parts.push("Cmd");

      // Add required keys (e.g., "B" in "Cmd+Shift+B+Left")
      if (chord.requiredKeys && chord.requiredKeys.length > 0) {
        chord.requiredKeys.forEach((key) => parts.push(key.toUpperCase()));
      }

      // Always uppercase single character keys for consistency
      parts.push(chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);

      return parts.join("+");
    })
    .join(" ");
}

/**
 * Format a key for display (handle special keys)
 */
function formatKey(key: string): string {
  // Case-insensitive lookup
  const lowerKey = key.toLowerCase();

  const keyMap: Record<string, string> = {
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    enter: "↵",
    backspace: "⌫",
    delete: "⌦",
    escape: "Esc",
    esc: "Esc",
    space: "␣",
    tab: "⇥",
  };

  return keyMap[lowerKey] ?? key.toUpperCase();
}

/**
 * Format a keybinding (array of chords) for visual display to users
 *
 * **Purpose**: Creates platform-specific, human-friendly keybinding strings for UI display.
 *
 * **Why not use normalizeKeybinding?**
 * - normalizeKeybinding is designed for comparison (platform-independent, always same output)
 * - Users expect to see platform-native symbols and conventions (⌘ on Mac, Ctrl on Windows)
 * - normalizeKeybinding shows raw key names ("ArrowUp") while users expect symbols ("↑")
 * - formatKeybindingForDisplay provides better UX by matching platform conventions
 *
 * **Key characteristics**:
 * - Platform-dependent (different output on Mac vs Windows/Linux)
 * - Uses Unicode symbols on Mac (⌘⌥⇧⌃) and text on other platforms (Ctrl, Alt, Shift)
 * - Mac: No separator between modifiers (⌘⌥K), others: "+" separator (Ctrl+Alt+K)
 * - Converts special keys to symbols (ArrowUp → ↑, Enter → ↵, etc.)
 *
 * @example
 * // On Mac
 * formatKeybindingForDisplay([{ meta: true, alt: true, key: "F" }])
 * // → "⌘⌥F" (Unicode symbols, no separators)
 *
 * @example
 * // On Windows/Linux
 * formatKeybindingForDisplay([{ meta: true, alt: true, key: "F" }])
 * // → "Ctrl+Alt+F" (text labels with + separators)
 *
 * @example
 * // Multi-chord keybinding on Mac
 * formatKeybindingForDisplay([
 *   { meta: true, key: "K" },
 *   { meta: true, key: "W" }
 * ])
 * // → "⌘K ⌘W"
 *
 * @example
 * // Special key formatting
 * formatKeybindingForDisplay([{ key: "ArrowUp" }])
 * // → "↑" (symbol instead of "ArrowUp")
 */
export function formatKeybindingForDisplay(chords: KeyChord[]): string {
  const formattedChords = chords.map((chord) => {
    const parts: string[] = [];

    // Add modifiers in consistent order
    if (chord.ctrl) parts.push("⌃");
    if (chord.alt) parts.push("⌥");
    if (chord.shift) parts.push("⇧");
    if (chord.meta) parts.push("⌘");

    // Add required keys (e.g., "B" in "Cmd+Shift+B+Left")
    if (chord.requiredKeys && chord.requiredKeys.length > 0) {
      chord.requiredKeys.forEach((key) => parts.push(key.toUpperCase()));
    }

    // Add the key
    parts.push(formatKey(chord.key));

    return parts.join("");
  });

  // Join multi-chords with space
  return formattedChords.join(" ");
}

/**
 * Format a keybinding for Electron menu accelerator
 *
 * Electron accelerators expect a specific format like "Cmd+Alt+F" or "CmdOrCtrl+X"
 * This is different from formatKeybindingForDisplay which uses Unicode symbols
 *
 * NOTE: This is ONLY for passing to Electron's accelerator field.
 * For displaying keybindings to users in the UI, use formatKeybindingForDisplay() instead,
 * or better yet, use the `primaryKeybinding` from the useCommand() hook.
 *
 * @param chords - The key chords to format
 * @returns Electron-compatible accelerator string
 *
 * @example
 * formatKeybindingForElectron([{ meta: true, alt: true, key: "F" }])
 * // → "Cmd+Alt+F" (on Mac) or "Ctrl+Alt+F" (on Windows/Linux)
 *
 * @example
 * formatKeybindingForElectron([{ meta: true, key: "ArrowUp" }])
 * // → "Cmd+Up"
 */
export function formatKeybindingForElectron(chords: KeyChord[]): string {
  // Only support single-chord keybindings for Electron menus
  // Multi-chord sequences (like Cmd+K Cmd+S) cannot be represented as Electron accelerators
  if (chords.length !== 1) {
    return "";
  }

  const chord = chords[0];
  const parts: string[] = [];

  // Add modifiers in Electron's expected order
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  if (chord.meta) parts.push("Cmd");

  // Note: Electron accelerators don't support required keys (like B in Cmd+Shift+B+Left)
  // These multi-key combinations should not be used as Electron menu accelerators
  if (chord.requiredKeys && chord.requiredKeys.length > 0) {
    console.warn("Electron accelerators do not support required keys:", chord);
    return "";
  }

  // Format the key for Electron
  const keyMap: Record<string, string> = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Escape: "Esc",
    Space: "Space",
    Tab: "Tab",
  };

  const key = keyMap[chord.key] ?? chord.key.toUpperCase();
  parts.push(key);

  return parts.join("+");
}

/**
 * Conflict information for a keybinding
 */
export interface KeybindingConflict {
  /** Normalized key string */
  normalizedKey: string;
  /** Command IDs that share this keybinding */
  commandIds: string[];
}

/**
 * Detect keybinding conflicts
 *
 * Returns a map of normalized keybinding strings to the command IDs that use them.
 * Only includes entries where multiple commands share the same keybinding.
 *
 * @param keybindingsByCommand - Map of command IDs to their resolved keybindings
 * @returns Map of normalized key strings to arrays of conflicting command IDs
 *
 * @example
 * const conflicts = detectKeybindingConflicts(keybindingsByCommand);
 * // Returns: Map { "Cmd+K" => ["command1", "command2"] }
 */
export function detectKeybindingConflicts(
  keybindingsByCommand: Map<string, ResolvedKeybinding[]>,
): Map<string, string[]> {
  const keyToCommands = new Map<string, string[]>();

  keybindingsByCommand.forEach((bindings, commandId) => {
    bindings.forEach((binding) => {
      const normalizedKey = normalizeKeybinding(binding.chords);

      const commands = keyToCommands.get(normalizedKey) || [];
      if (!commands.includes(commandId)) {
        commands.push(commandId);
      }
      keyToCommands.set(normalizedKey, commands);
    });
  });

  // Only return actual conflicts (multiple commands sharing a key)
  const conflicts = new Map<string, string[]>();
  keyToCommands.forEach((commands, key) => {
    if (commands.length > 1) {
      conflicts.set(key, commands);
    }
  });

  return conflicts;
}
