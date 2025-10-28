/**
 * Keyboard shortcut descriptor
 */
export interface KeybindingDescriptor {
  /** Default keybinding (cross-platform) */
  key: string;

  /** macOS-specific override */
  mac?: string;

  /** Windows-specific override */
  win?: string;

  /** Linux-specific override */
  linux?: string;
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
}

/**
 * Resolved keybinding (internal)
 */
export interface ResolvedKeybinding {
  commandId: string;
  chords: KeyChord[];
  weight: number; // Higher weight = higher priority
}
