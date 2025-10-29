import type { KeyChord } from './types';

/**
 * Format a key for display (handle special keys)
 */
function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Enter': '↵',
    'Backspace': '⌫',
    'Delete': '⌦',
    'Escape': 'Esc',
    'Space': '␣',
    'Tab': '⇥',
  };

  return keyMap[key] ?? key.toUpperCase();
}

/**
 * Format a keybinding (array of chords) for display
 *
 * @example
 * // Single chord: "Cmd+Alt+F" on Mac
 * formatKeybindingForDisplay([{ meta: true, alt: true, key: "F" }])
 * // → "⌘⌥F"
 *
 * @example
 * // Multi-chord: "Cmd+K Cmd+W" on Mac
 * formatKeybindingForDisplay([
 *   { meta: true, key: "K" },
 *   { meta: true, key: "W" }
 * ])
 * // → "⌘K ⌘W"
 */
export function formatKeybindingForDisplay(chords: KeyChord[]): string {
  const isMac = navigator.userAgent.toLowerCase().includes('mac');

  // Format each chord
  const formattedChords = chords.map(chord => {
    const parts: string[] = [];

    // Add modifiers in consistent order
    if (chord.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
    if (chord.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (chord.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (chord.meta) parts.push(isMac ? '⌘' : 'Ctrl');  // Meta = Cmd on Mac, Ctrl elsewhere

    // Add the key
    parts.push(formatKey(chord.key));

    // Join: Mac uses no separator (⌘⌥F), others use + (Ctrl+Alt+F)
    return parts.join(isMac ? '' : '+');
  });

  // Join multi-chords with space
  return formattedChords.join(' ');
}
