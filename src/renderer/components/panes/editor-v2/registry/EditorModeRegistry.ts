/**
 * EditorModeRegistry - Enforces same-file same-mode policy.
 *
 * This singleton registry ensures that the same file uses the same editor mode
 * across all instances. When a file is opened in diff mode in one tab, all other
 * tabs showing that file will also switch to diff mode.
 *
 * Why This Matters:
 * - **Consistency**: Users expect the same file to look the same everywhere
 * - **Simplicity**: One source of truth for mode per file
 * - **Git Integration**: Diff mode is per-file (comparing against HEAD), so it
 *   makes sense for all views of that file to show the diff
 *
 * Usage:
 * ```typescript
 * const registry = EditorModeRegistry.getInstance();
 *
 * // Get current mode (defaults to 'editor' if not set)
 * const mode = registry.getMode('/path/to/file.ts');
 *
 * // Set mode (fires event if changed)
 * registry.setMode('/path/to/file.ts', { type: 'diff' });
 *
 * // Listen for mode changes
 * const sub = registry.onModeChanged((event) => {
 *   console.log(`${event.filePath} changed from ${event.oldMode} to ${event.newMode}`);
 * });
 *
 * // Clear mode when file is closed everywhere
 * registry.clearMode('/path/to/file.ts');
 * ```
 *
 * @see docs/architecture/editor-v2-design-narrative.md (Section 8.3)
 */

import type { EditorMode, EditorModeChangedEvent } from "../types";
import { EventEmitter } from "../utils/EventEmitter";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compare two EditorMode values for equality.
 */
function modesEqual(
  a: EditorMode | undefined,
  b: EditorMode | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (a.type !== b.type) return false;

  if (a.type === "diff" && b.type === "diff") {
    return a.baseBranch === b.baseBranch;
  }

  return true;
}

// ============================================================================
// EditorModeRegistry
// ============================================================================

/**
 * Singleton registry for editor modes.
 *
 * Tracks the current editor mode (regular vs diff) for each file path.
 * Enforces that the same file uses the same mode across all instances.
 */
export class EditorModeRegistry {
  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static instance: EditorModeRegistry | null = null;

  /**
   * Get the singleton instance.
   */
  static getInstance(): EditorModeRegistry {
    if (!EditorModeRegistry.instance) {
      EditorModeRegistry.instance = new EditorModeRegistry();
    }
    return EditorModeRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   */
  static resetInstance(): void {
    if (EditorModeRegistry.instance) {
      EditorModeRegistry.instance.dispose();
      EditorModeRegistry.instance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------

  /** Map of file path to current mode */
  private modes = new Map<string, EditorMode>();

  /** Event emitter for mode changes */
  private readonly _onModeChanged = new EventEmitter<EditorModeChangedEvent>();

  /** Private constructor - use getInstance() */
  private constructor() {}

  // ---------------------------------------------------------------------------
  // Public Events
  // ---------------------------------------------------------------------------

  /**
   * Event fired when a file's editor mode changes.
   *
   * Subscribe to this to keep UI in sync when mode changes in another tab.
   */
  readonly onModeChanged = this._onModeChanged.event;

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the current mode for a file.
   *
   * Returns the default mode ({ type: 'editor' }) if not explicitly set.
   *
   * @param filePath - Absolute path to the file
   * @returns Current editor mode
   */
  getMode(filePath: string): EditorMode {
    return this.modes.get(filePath) ?? { type: "editor" };
  }

  /**
   * Set the mode for a file.
   *
   * If the mode actually changes, fires the onModeChanged event so all
   * components showing this file can update.
   *
   * @param filePath - Absolute path to the file
   * @param mode - New editor mode
   */
  setMode(filePath: string, mode: EditorMode): void {
    const currentMode = this.modes.get(filePath);

    // Only fire event if mode actually changed
    if (!modesEqual(currentMode, mode)) {
      this.modes.set(filePath, mode);

      this._onModeChanged.fire({
        filePath,
        oldMode: currentMode,
        newMode: mode,
      });
    }
  }

  /**
   * Clear the mode for a file.
   *
   * Call this when a file is closed in all tabs to clean up memory.
   * Note: This does NOT fire an event since no one should be listening.
   *
   * @param filePath - Absolute path to the file
   */
  clearMode(filePath: string): void {
    this.modes.delete(filePath);
  }

  /**
   * Check if a file has an explicit mode set.
   *
   * @param filePath - Absolute path to the file
   * @returns True if mode is explicitly set (not using default)
   */
  hasMode(filePath: string): boolean {
    return this.modes.has(filePath);
  }

  /**
   * Get the number of files with explicit modes.
   */
  get modeCount(): number {
    return this.modes.size;
  }

  /**
   * Get all file paths that have explicit modes set.
   *
   * Useful for debugging.
   */
  getAllPaths(): string[] {
    return Array.from(this.modes.keys());
  }

  /**
   * Clear all modes.
   *
   * Used during cleanup or testing.
   */
  clearAll(): void {
    this.modes.clear();
  }

  /**
   * Dispose the registry.
   */
  dispose(): void {
    this.modes.clear();
    this._onModeChanged.dispose();
  }
}
