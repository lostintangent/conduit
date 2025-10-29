import type { KeyChord } from './types';

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
 */
export function parseChord(chord: string): KeyChord {
  const parts = chord.toLowerCase().split('+');

  // Extract modifiers
  const ctrl = parts.includes('ctrl');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');
  const meta = parts.includes('cmd') || parts.includes('meta') || parts.includes('win');

  // Last part is the key
  const key = parts[parts.length - 1];

  return { ctrl, shift, alt, meta, key };
}

/**
 * Check if a keyboard event matches a chord
 */
export function matchesEvent(chord: KeyChord, event: KeyboardEvent): boolean {
  return (
    chord.ctrl === event.ctrlKey &&
    chord.shift === event.shiftKey &&
    chord.alt === event.altKey &&
    chord.meta === event.metaKey &&
    normalizeKey(chord.key) === normalizeKey(event.key)
  );
}

/**
 * Normalize key names to match browser KeyboardEvent.key
 */
export function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    escape: 'Escape',
    esc: 'Escape',
    enter: 'Enter',
    return: 'Enter',
    tab: 'Tab',
    space: ' ',
    backspace: 'Backspace',
    delete: 'Delete',
    del: 'Delete',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };

  const normalized = key.toLowerCase();
  return map[normalized] || key.toLowerCase();
}

/**
 * Format a chord as a human-readable string
 */
export function formatChord(chord: KeyChord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  if (chord.meta) parts.push('Cmd');
  parts.push(chord.key.toUpperCase());
  return parts.join('+');
}

/**
 * Format multiple chords as a keybinding string
 */
export function formatKeybinding(chords: KeyChord[]): string {
  return chords.map(formatChord).join(' ');
}
