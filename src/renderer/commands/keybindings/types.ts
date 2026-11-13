/**
 * Keyboard shortcut descriptor
 */
export interface KeybindingDescriptor {
  key: string;
}

/**
 * Parsed key chord
 */
export interface KeyChord {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
  /** Additional keys that must be held down (e.g., "b" in "Cmd+Shift+B+Left") */
  requiredKeys?: string[];
}

/**
 * Resolved keybinding (internal)
 */
export interface ResolvedKeybinding {
  commandId: string;
  chords: KeyChord[];
  weight: number; // Higher weight = higher priority
}

/**
 * User keybinding data (persisted to file)
 */
export interface UserKeybinding {
  key: string;
  command: string;
}

/**
 * Weight constant for user-defined keybindings
 * User bindings have higher weight than defaults (0) to ensure they take precedence
 */
export const USER_KEYBINDING_WEIGHT = 1000;

/**
 * Check if a keybinding is a user override (vs default)
 */
export function isUserKeybinding(binding: ResolvedKeybinding): boolean {
  return binding.weight >= USER_KEYBINDING_WEIGHT;
}
