/**
 * EditorRegistry - Global storage for Monaco editor instances.
 *
 * This singleton registry stores Monaco editor instances globally to eliminate
 * the cost of creating/destroying editors on every tab switch. Instead of
 * disposing editors when tabs unmount, we keep them alive and reuse them.
 *
 * Key Features:
 * - **Portal Pattern**: When an editor moves to a new container (tab switch),
 *   we physically move the DOM element rather than recreating the editor.
 * - **ViewState Preservation**: Monaco's ViewState (scroll, cursor, selections)
 *   is automatically preserved because the editor instance persists.
 * - **LRU Eviction**: Memory is bounded by disposing least-recently-used editors
 *   when the limit is exceeded (default: 15 editors max).
 *
 * Usage:
 * ```typescript
 * const registry = EditorRegistry.getInstance();
 *
 * // Get or create an editor
 * const editor = registry.getOrCreateEditor('editor-1', containerElement, options);
 *
 * // When done (e.g., component unmount), release but don't dispose
 * registry.releaseEditor('editor-1');
 *
 * // The editor stays in the registry for potential reuse
 * // LRU eviction handles cleanup automatically
 * ```
 *
 * @see docs/architecture/editor-v2-design-narrative.md (Section 8.2)
 */

import * as monaco from "monaco-editor";
import type { EditorMetadata } from "../types";
import { EventEmitter } from "@shared/EventEmitter";
import { ViewStateRegistry } from "./ViewStateRegistry";

/**
 * Internal editor entry for tracking.
 */
interface EditorEntryInternal {
  /** The Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor;

  /** The DOM container element the editor is rendered in */
  container: HTMLElement;

  /** Metadata for lifecycle management */
  metadata: EditorMetadata;

  /** Whether this editor is currently in use (actively mounted) */
  inUse: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default maximum number of editors to keep in the registry */
const DEFAULT_MAX_EDITORS = 15;

/** Debounce delay for layout calls (ms) - prevents excessive layouts during animations */
const LAYOUT_DEBOUNCE_MS = 16; // One frame at 60fps

// ============================================================================
// EditorRegistry
// ============================================================================

/**
 * Singleton registry for Monaco editor instances.
 *
 * Manages editor lifecycle with reference tracking and LRU eviction.
 */
export class EditorRegistry {
  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static instance: EditorRegistry | null = null;

  /** Static event emitter for reset notifications (persists across resets) */
  private static readonly _onReset = new EventEmitter<void>();

  /**
   * Event fired when the registry is reset.
   *
   * Components should subscribe to this event and reinitialize when fired.
   * This is a static event that persists across instance resets.
   */
  static readonly onReset = EditorRegistry._onReset.event;

  /**
   * Get the singleton instance.
   */
  static getInstance(): EditorRegistry {
    if (!EditorRegistry.instance) {
      EditorRegistry.instance = new EditorRegistry();
    }
    return EditorRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   *
   * Fires the onReset event before disposing so components can clean up.
   * Then disposes all editors and clears the singleton.
   */
  static resetInstance(): void {
    // Fire reset event BEFORE disposing so listeners can clean up
    EditorRegistry._onReset.fire();

    if (EditorRegistry.instance) {
      EditorRegistry.instance.disposeAll();
      EditorRegistry.instance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------

  /** Map of editor ID to editor entry */
  private editors = new Map<string, EditorEntryInternal>();

  /** Maximum number of editors to keep (for LRU eviction) */
  private maxEditors: number = DEFAULT_MAX_EDITORS;

  /** Map of editor ID to pending layout debounce timer */
  private layoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Private constructor - use getInstance() */
  private constructor() {}

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Get an existing editor or create a new one.
   *
   * If an editor with the given ID already exists:
   * - The editor is moved to the new container (portal pattern)
   * - ViewState is preserved during the move
   * - The lastUsed timestamp is updated
   *
   * If no editor exists:
   * - A new Monaco editor is created in the container
   * - LRU eviction runs if we exceed maxEditors
   *
   * @param editorId - Unique identifier for this editor
   * @param container - DOM element to render the editor in
   * @param options - Monaco editor construction options (only used for new editors)
   * @returns The Monaco editor instance
   */
  getOrCreateEditor(
    editorId: string,
    container: HTMLElement,
    options?: monaco.editor.IStandaloneEditorConstructionOptions,
  ): monaco.editor.IStandaloneCodeEditor {
    const existing = this.editors.get(editorId);

    if (existing) {
      // Editor exists - move to new container if different
      if (existing.container !== container) {
        this.moveEditorToContainer(existing, container);
      }

      // Update last used timestamp and mark as in use
      existing.metadata.lastUsed = Date.now();
      existing.inUse = true;

      return existing.editor;
    }

    // Create new editor
    const editor = this.createEditor(editorId, container, options);

    // Run LRU eviction if needed
    this.evictLRU();

    return editor;
  }

  /**
   * Release an editor reference.
   *
   * This marks the editor as not actively in use, but does NOT dispose it.
   * The editor stays in the registry for potential reuse.
   * Actual disposal happens via LRU eviction.
   *
   * @param editorId - The editor ID to release
   */
  releaseEditor(editorId: string): void {
    const entry = this.editors.get(editorId);
    if (entry) {
      // Update last used timestamp
      entry.metadata.lastUsed = Date.now();
      // Mark as not in use (eligible for eviction)
      entry.inUse = false;
    }
  }

  /**
   * Dispose a specific editor and remove it from the registry.
   *
   * Use this for explicit cleanup. Normally LRU eviction handles disposal.
   *
   * @param editorId - The editor ID to dispose
   */
  disposeEditor(editorId: string): void {
    const entry = this.editors.get(editorId);
    if (!entry) {
      return;
    }

    // Clear any pending layout timer
    const layoutTimer = this.layoutTimers.get(editorId);
    if (layoutTimer) {
      clearTimeout(layoutTimer);
      this.layoutTimers.delete(editorId);
    }

    // Clear ViewState for this editor (cross-registry cleanup)
    // This prevents memory leaks when editors are disposed via LRU eviction
    ViewStateRegistry.getInstance().clearEditor(editorId);

    // Dispose the Monaco editor
    entry.editor.dispose();

    // Remove from registry
    this.editors.delete(editorId);
  }

  /**
   * Check if an editor exists in the registry.
   *
   * @param editorId - The editor ID to check
   * @returns True if the editor exists
   */
  hasEditor(editorId: string): boolean {
    return this.editors.has(editorId);
  }

  /**
   * Get an editor without creating it.
   *
   * @param editorId - The editor ID to get
   * @returns The editor instance, or undefined if not found
   */
  getEditor(editorId: string): monaco.editor.IStandaloneCodeEditor | undefined {
    return this.editors.get(editorId)?.editor;
  }

  /**
   * Get the current number of editors in the registry.
   */
  get editorCount(): number {
    return this.editors.size;
  }

  /**
   * Set the maximum number of editors (for LRU eviction).
   *
   * If the new limit is lower than the current count, eviction runs immediately.
   *
   * @param max - Maximum number of editors to keep
   */
  setMaxEditors(max: number): void {
    this.maxEditors = max;
    this.evictLRU();
  }

  /**
   * Get metadata for an editor.
   *
   * @param editorId - The editor ID
   * @returns The editor metadata, or undefined if not found
   */
  getMetadata(editorId: string): EditorMetadata | undefined {
    return this.editors.get(editorId)?.metadata;
  }

  /**
   * Trigger a layout recalculation for an editor.
   *
   * This is debounced to prevent excessive layout calls during animations
   * or rapid visibility changes. Call this when:
   * - An editor's container becomes visible after being hidden
   * - An editor is moved to a new container
   * - The container is resized
   *
   * @param editorId - The editor ID to layout
   * @param immediate - If true, skip debouncing and layout immediately
   */
  triggerLayout(editorId: string, immediate = false): void {
    const entry = this.editors.get(editorId);
    if (!entry) return;

    // Clear any existing debounce timer for this editor
    const existingTimer = this.layoutTimers.get(editorId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.layoutTimers.delete(editorId);
    }

    const doLayout = () => {
      this.layoutTimers.delete(editorId);
      // Use requestAnimationFrame to ensure layout happens after DOM updates
      requestAnimationFrame(() => {
        const currentEntry = this.editors.get(editorId);
        if (currentEntry) {
          currentEntry.editor.layout();
        }
      });
    };

    if (immediate) {
      doLayout();
    } else {
      // Debounce the layout call
      const timer = setTimeout(doLayout, LAYOUT_DEBOUNCE_MS);
      this.layoutTimers.set(editorId, timer);
    }
  }

  /**
   * Trigger layout for all editors.
   *
   * Useful when the application window is resized or visibility changes globally.
   *
   * @param immediate - If true, skip debouncing
   */
  triggerLayoutAll(immediate = false): void {
    for (const editorId of this.editors.keys()) {
      this.triggerLayout(editorId, immediate);
    }
  }

  /**
   * Dispose all editors and clear the registry.
   *
   * Used during shutdown or testing cleanup.
   */
  disposeAll(): void {
    // Clear all layout timers first
    for (const timer of this.layoutTimers.values()) {
      clearTimeout(timer);
    }
    this.layoutTimers.clear();

    // Dispose all editors
    for (const [editorId, entry] of this.editors) {
      try {
        entry.editor.dispose();
      } catch (error) {
        console.error(
          `[EditorRegistry] Error disposing editor ${editorId}:`,
          error,
        );
      }
    }
    this.editors.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new Monaco editor and add it to the registry.
   */
  private createEditor(
    editorId: string,
    container: HTMLElement,
    options?: monaco.editor.IStandaloneEditorConstructionOptions,
  ): monaco.editor.IStandaloneCodeEditor {
    const editor = monaco.editor.create(container, {
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      ...options,
    });

    const entry: EditorEntryInternal = {
      editor,
      container,
      metadata: {
        createdAt: Date.now(),
        lastUsed: Date.now(),
      },
      inUse: true, // New editors are in use
    };

    this.editors.set(editorId, entry);

    return editor;
  }

  /**
   * Move an existing editor to a new container (portal pattern).
   *
   * This physically moves the DOM element rather than recreating the editor.
   * ViewState is saved before the move and restored after.
   */
  private moveEditorToContainer(
    entry: EditorEntryInternal,
    newContainer: HTMLElement,
  ): void {
    const { editor } = entry;

    // Save ViewState before moving
    const viewState = editor.saveViewState();

    // Get the editor's DOM node
    const domNode = editor.getDomNode();
    if (domNode && domNode.parentElement !== newContainer) {
      // Move the DOM element to the new container
      newContainer.appendChild(domNode);

      // Update the container reference
      entry.container = newContainer;

      // Trigger a layout update so Monaco knows about the new container size
      editor.layout();
    }

    // Restore ViewState after moving
    if (viewState) {
      editor.restoreViewState(viewState);
    }
  }

  /**
   * Evict least-recently-used editors to stay within maxEditors limit.
   *
   * Editors currently in use are protected from eviction.
   * Remaining editors are sorted by lastUsed timestamp, and the oldest
   * ones are disposed until we're at or below the limit.
   */
  private evictLRU(): void {
    if (this.editors.size <= this.maxEditors) {
      return;
    }

    // Get editors not in use, sorted by lastUsed (oldest first)
    const candidates = Array.from(this.editors.entries())
      .filter(([, entry]) => !entry.inUse)
      .sort(([, a], [, b]) => a.metadata.lastUsed - b.metadata.lastUsed);

    // Count how many we need to dispose
    const inUseCount = this.editors.size - candidates.length;
    const targetSize = Math.max(this.maxEditors, inUseCount);
    const toDisposeCount = this.editors.size - targetSize;

    if (toDisposeCount <= 0) {
      return;
    }

    // Dispose oldest editors not in use
    for (let i = 0; i < toDisposeCount && i < candidates.length; i++) {
      const [editorId] = candidates[i];
      this.disposeEditor(editorId);
    }
  }
}
