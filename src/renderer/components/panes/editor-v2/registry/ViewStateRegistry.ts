/**
 * ViewStateRegistry - Storage for Monaco editor ViewState.
 *
 * This singleton registry stores Monaco ViewState objects (scroll position,
 * cursor position, selections, folded regions) per editor instance. This
 * enables ViewState restoration when switching between files or tabs.
 *
 * Why This Exists:
 *
 * Monaco editors have two types of state:
 * 1. **Model State**: File content, undo history - stored in the model itself
 * 2. **View State**: Scroll position, cursor, selections - stored per editor
 *
 * When you switch files in an editor, the model changes but the editor remains.
 * We need to save the ViewState for the old file and restore it when switching back.
 *
 * The key insight is that ViewState is per (editor, file) pair, not just per file.
 * Two editors showing the same file can have different scroll positions.
 *
 * Memory Management:
 *
 * To prevent unbounded memory growth, this registry implements LRU eviction:
 * - Entries are evicted when the registry exceeds maxEntries (default: 200)
 * - Eviction is based on lastUsed timestamp (least recently used first)
 * - Setting/getting a ViewState updates its lastUsed timestamp
 *
 * Usage:
 * ```typescript
 * const registry = ViewStateRegistry.getInstance();
 *
 * // Save ViewState before switching files
 * registry.save('editor-1', '/path/to/file.ts', editor);
 *
 * // Restore ViewState after switching back
 * registry.restore('editor-1', '/path/to/file.ts', editor);
 *
 * // Clear when done with a file
 * registry.clear('editor-1', '/path/to/file.ts');
 * ```
 *
 * @see docs/architecture/editor-v2-design-narrative.md (Section 10)
 */

import type * as monaco from "monaco-editor";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default maximum number of ViewState entries to keep.
 *
 * ViewState objects are relatively small (a few KB each at most), so we can
 * keep more of them than models. 200 entries is a reasonable balance between
 * memory usage and user experience (fewer cache misses).
 */
const DEFAULT_MAX_ENTRIES = 200;

// ============================================================================
// Types
// ============================================================================

/**
 * Key for identifying a ViewState entry.
 *
 * ViewState is specific to both the editor AND the file, because different
 * editors can have different scroll/cursor positions for the same file.
 */
interface ViewStateKey {
  editorId: string;
  filePath: string;
}

/**
 * Internal entry that wraps ViewState with metadata for LRU eviction.
 */
interface ViewStateEntry {
  /** The Monaco ViewState object */
  viewState: monaco.editor.ICodeEditorViewState;

  /** Timestamp of last access (get or set) for LRU eviction */
  lastUsed: number;
}

/**
 * Create a string key from editorId and filePath.
 */
function makeKey(editorId: string, filePath: string): string {
  return `${editorId}::${filePath}`;
}

// ============================================================================
// ViewStateRegistry
// ============================================================================

/**
 * Singleton registry for Monaco ViewState.
 *
 * Stores and restores ViewState (scroll, cursor, selections, folding)
 * per (editor, file) pair.
 */
export class ViewStateRegistry {
  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static instance: ViewStateRegistry | null = null;

  /**
   * Get the singleton instance.
   */
  static getInstance(): ViewStateRegistry {
    if (!ViewStateRegistry.instance) {
      ViewStateRegistry.instance = new ViewStateRegistry();
    }
    return ViewStateRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   */
  static resetInstance(): void {
    if (ViewStateRegistry.instance) {
      ViewStateRegistry.instance.clearAll();
      ViewStateRegistry.instance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------

  /** Map of (editorId::filePath) to ViewStateEntry (includes lastUsed for LRU) */
  private states = new Map<string, ViewStateEntry>();

  /** Maximum number of entries (for LRU eviction) */
  private maxEntries: number = DEFAULT_MAX_ENTRIES;

  /** Private constructor - use getInstance() */
  private constructor() {}

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Save the current ViewState from an editor.
   *
   * Call this before switching to a different file in the editor.
   * Updates the lastUsed timestamp and may trigger LRU eviction.
   *
   * @param editorId - The editor's unique identifier
   * @param filePath - The file path whose ViewState we're saving
   * @param editor - The Monaco editor instance
   */
  save(
    editorId: string,
    filePath: string,
    editor: monaco.editor.IStandaloneCodeEditor,
  ): void {
    const viewState = editor.saveViewState();

    if (viewState) {
      const key = makeKey(editorId, filePath);
      this.states.set(key, {
        viewState,
        lastUsed: Date.now(),
      });

      // Evict LRU entries if over limit
      this.evictLRU();
    }
  }

  /**
   * Restore ViewState to an editor.
   *
   * Call this after switching back to a file in the editor.
   * If no ViewState is saved, this is a no-op.
   * Updates the lastUsed timestamp on successful restore.
   *
   * @param editorId - The editor's unique identifier
   * @param filePath - The file path whose ViewState we're restoring
   * @param editor - The Monaco editor instance
   * @returns True if ViewState was restored, false if none was saved
   */
  restore(
    editorId: string,
    filePath: string,
    editor: monaco.editor.IStandaloneCodeEditor,
  ): boolean {
    const key = makeKey(editorId, filePath);
    const entry = this.states.get(key);

    if (entry) {
      editor.restoreViewState(entry.viewState);
      // Update lastUsed timestamp on access
      entry.lastUsed = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Get saved ViewState without restoring it.
   *
   * Updates the lastUsed timestamp on access (for LRU purposes).
   *
   * @param editorId - The editor's unique identifier
   * @param filePath - The file path
   * @returns The saved ViewState, or undefined if none
   */
  get(
    editorId: string,
    filePath: string,
  ): monaco.editor.ICodeEditorViewState | undefined {
    const key = makeKey(editorId, filePath);
    const entry = this.states.get(key);

    if (entry) {
      // Update lastUsed timestamp on access
      entry.lastUsed = Date.now();
      return entry.viewState;
    }

    return undefined;
  }

  /**
   * Check if ViewState exists for an (editor, file) pair.
   *
   * @param editorId - The editor's unique identifier
   * @param filePath - The file path
   */
  has(editorId: string, filePath: string): boolean {
    const key = makeKey(editorId, filePath);
    return this.states.has(key);
  }

  /**
   * Clear saved ViewState for an (editor, file) pair.
   *
   * Call this when a file is closed in an editor.
   *
   * @param editorId - The editor's unique identifier
   * @param filePath - The file path
   */
  clear(editorId: string, filePath: string): void {
    const key = makeKey(editorId, filePath);
    this.states.delete(key);
  }

  /**
   * Clear all ViewState for an editor.
   *
   * Call this when an editor is disposed.
   *
   * @param editorId - The editor's unique identifier
   */
  clearEditor(editorId: string): void {
    const prefix = `${editorId}::`;
    for (const key of this.states.keys()) {
      if (key.startsWith(prefix)) {
        this.states.delete(key);
      }
    }
  }

  /**
   * Clear all ViewState for a file path across all editors.
   *
   * Call this when a file is deleted.
   *
   * @param filePath - The file path
   */
  clearFile(filePath: string): void {
    const suffix = `::${filePath}`;
    for (const key of this.states.keys()) {
      if (key.endsWith(suffix)) {
        this.states.delete(key);
      }
    }
  }

  /**
   * Get the number of stored ViewStates.
   */
  get stateCount(): number {
    return this.states.size;
  }

  /**
   * Get the maximum number of entries before LRU eviction.
   */
  getMaxEntries(): number {
    return this.maxEntries;
  }

  /**
   * Set the maximum number of entries before LRU eviction.
   *
   * Immediately triggers eviction if current count exceeds new limit.
   *
   * @param max - Maximum entries to keep
   */
  setMaxEntries(max: number): void {
    this.maxEntries = max;
    this.evictLRU();
  }

  /**
   * Clear all saved ViewStates.
   *
   * Used during cleanup or testing.
   */
  clearAll(): void {
    this.states.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Evict least-recently-used entries to stay within maxEntries limit.
   *
   * Sorts entries by lastUsed timestamp and removes the oldest ones
   * until we're at or below the limit.
   */
  private evictLRU(): void {
    if (this.states.size <= this.maxEntries) {
      return;
    }

    // Get entries sorted by lastUsed (oldest first)
    const sortedEntries = Array.from(this.states.entries()).sort(
      ([, a], [, b]) => a.lastUsed - b.lastUsed,
    );

    // Calculate how many to remove
    const toRemove = this.states.size - this.maxEntries;

    // Remove oldest entries
    for (let i = 0; i < toRemove; i++) {
      const [key] = sortedEntries[i];
      this.states.delete(key);
    }
  }
}
