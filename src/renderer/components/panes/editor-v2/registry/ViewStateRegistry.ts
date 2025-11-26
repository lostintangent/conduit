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

  /** Map of (editorId::filePath) to ViewState */
  private states = new Map<string, monaco.editor.ICodeEditorViewState>();

  /** Private constructor - use getInstance() */
  private constructor() {}

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Save the current ViewState from an editor.
   *
   * Call this before switching to a different file in the editor.
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
      this.states.set(key, viewState);
    }
  }

  /**
   * Restore ViewState to an editor.
   *
   * Call this after switching back to a file in the editor.
   * If no ViewState is saved, this is a no-op.
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
    const viewState = this.states.get(key);

    if (viewState) {
      editor.restoreViewState(viewState);
      return true;
    }

    return false;
  }

  /**
   * Get saved ViewState without restoring it.
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
    return this.states.get(key);
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
   * Clear all saved ViewStates.
   *
   * Used during cleanup or testing.
   */
  clearAll(): void {
    this.states.clear();
  }
}
