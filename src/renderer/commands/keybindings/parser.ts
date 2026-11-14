import type { KeyChord } from "./types";

/**
 * Track currently pressed keys (excluding modifiers)
 */
const pressedKeys = new Set<string>();

/**
 * Track keydown events to maintain set of pressed keys
 */
export function trackKeyDown(event: KeyboardEvent): void {
  if (!isModifierKey(event.key)) {
    pressedKeys.add(normalizeKey(event.key).toLowerCase());
  }
}

/** Whether the key is a modifier pressed on its own (e.g. Cmd's own keydown) */
export function isModifierKey(key: string): boolean {
  return ["control", "shift", "alt", "meta"].includes(normalizeKey(key));
}

/**
 * Track keyup events to maintain set of pressed keys
 */
export function trackKeyUp(event: KeyboardEvent): void {
  const key = normalizeKey(event.key);
  pressedKeys.delete(key.toLowerCase());
}

/**
 * Clear all tracked keys (useful for focus loss, etc.)
 */
export function clearPressedKeys(): void {
  pressedKeys.clear();
}

/**
 * Parse a keybinding string into key chords
 * Examples: "Cmd+T", "Cmd+K Cmd+W", "Ctrl+Shift+P"
 */
export function parseKeybinding(input: string): KeyChord[] {
  // Split by spaces for chords: "Cmd+K Cmd+W" → ["Cmd+K", "Cmd+W"]
  const chordStrings = input.trim().split(/\s+/);
  return chordStrings.map(parseChord);
}

/**
 * Parse a single chord string
 * Example: "Cmd+Shift+T" → { ctrl: false, shift: true, alt: false, meta: true, key: 't' }
 * Example: "Cmd+Shift+B+Left" → { ctrl: false, shift: true, alt: false, meta: true, key: 'left', requiredKeys: ['b'] }
 */
export function parseChord(chord: string): KeyChord {
  const parts = chord.toLowerCase().split("+");

  // Known modifier keys
  const modifierKeys = ["ctrl", "shift", "alt", "cmd", "meta", "win"];

  // Extract modifiers
  const ctrl = parts.includes("ctrl");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  const meta =
    parts.includes("cmd") || parts.includes("meta") || parts.includes("win");

  // Last part is the main key
  const key = parts[parts.length - 1];

  // Everything else (not modifiers, not the final key) are required keys
  const requiredKeys = parts
    .slice(0, -1) // Exclude the last key
    .filter((part) => !modifierKeys.includes(part)); // Exclude modifiers

  return {
    ctrl,
    shift,
    alt,
    meta,
    key,
    ...(requiredKeys.length > 0 && { requiredKeys }),
  };
}

/**
 * Check if a keyboard event matches a chord
 */
export function matchesEvent(chord: KeyChord, event: KeyboardEvent): boolean {
  // Check modifiers and main key
  const modifiersMatch =
    chord.ctrl === event.ctrlKey &&
    chord.shift === event.shiftKey &&
    chord.alt === event.altKey &&
    chord.meta === event.metaKey &&
    normalizeKey(chord.key) === normalizeKey(event.key);

  if (!modifiersMatch) {
    return false;
  }

  // Get all currently pressed keys excluding the current trigger key
  const pressedKeysExcludingTrigger = new Set(pressedKeys);
  pressedKeysExcludingTrigger.delete(normalizeKey(event.key).toLowerCase());

  // Check required keys (e.g., "b" in "Cmd+Shift+B+Left")
  if (chord.requiredKeys && chord.requiredKeys.length > 0) {
    return chord.requiredKeys.every((requiredKey) =>
      pressedKeysExcludingTrigger.has(requiredKey.toLowerCase()),
    );
  }

  // If no required keys, ensure NO extra keys are pressed
  // This prevents Cmd+Shift+Up from matching when Cmd+Shift+E+Up is pressed
  if (pressedKeysExcludingTrigger.size > 0) {
    return false;
  }

  return true;
}

/**
 * Normalize key names to match browser KeyboardEvent.key
 */
export function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    escape: "Escape",
    esc: "Escape",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    space: " ",
    backspace: "Backspace",
    delete: "Delete",
    del: "Delete",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  };

  const normalized = key.toLowerCase();
  return map[normalized] || key.toLowerCase();
}
