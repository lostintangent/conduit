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
import { EventEmitter } from "../utils/EventEmitter";

/** Delay before unpinning an editor after it becomes hidden (aligned with model grace period) */
const UNPIN_DELAY_MS = 5000;

/** Maximum number of pinned editors to prevent unbounded memory growth */
const DEFAULT_MAX_PINNED_EDITORS = 5;

/**
 * Extended editor entry with pinning support.
 */
interface EditorEntryInternal {
  /** The Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor;

  /** The DOM container element the editor is rendered in */
  container: HTMLElement;

  /** Metadata for lifecycle management */
  metadata: EditorMetadata;

  /** If true, this editor cannot be evicted by LRU */
  isPinned: boolean;

  /** Timer for delayed unpin */
  unpinTimer?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default maximum number of editors to keep in the registry */
const DEFAULT_MAX_EDITORS = 15;

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

  /** Maximum number of pinned editors to prevent unbounded memory */
  private maxPinnedEditors: number = DEFAULT_MAX_PINNED_EDITORS;

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

      // Update last used timestamp
      existing.metadata.lastUsed = Date.now();

      // Auto-pin when editor is retrieved (being actively used)
      this.pinEditor(editorId);

      return existing.editor;
    }

    // Create new editor
    const editor = this.createEditor(editorId, container, options);

    // Enforce pinned limit - new editors start pinned, so we need to
    // unpin oldest if we exceed the limit
    this.enforcePinnedLimit();

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
      // Update last used so it's not immediately evicted
      entry.metadata.lastUsed = Date.now();

      // Unpin with delay - editor becomes eligible for LRU eviction
      // The delay prevents thrashing during rapid tab switches
      this.unpinEditor(editorId);
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

    // Clear any pending unpin timer
    if (entry.unpinTimer) {
      clearTimeout(entry.unpinTimer);
    }

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
   * Pin an editor to prevent it from being evicted by LRU.
   *
   * Call this when an editor becomes visible/active. Pinned editors
   * are protected from eviction until explicitly unpinned.
   *
   * If pinning would exceed maxPinnedEditors, the oldest pinned editors
   * are automatically unpinned to make room.
   *
   * @param editorId - The editor ID to pin
   */
  pinEditor(editorId: string): void {
    const entry = this.editors.get(editorId);
    if (!entry) {
      return;
    }

    // Cancel any pending unpin
    if (entry.unpinTimer) {
      clearTimeout(entry.unpinTimer);
      entry.unpinTimer = undefined;
    }

    // If already pinned, nothing more to do
    if (entry.isPinned) {
      return;
    }

    entry.isPinned = true;

    // Enforce pinned limit - unpin oldest pinned editors if we exceed the limit
    this.enforcePinnedLimit();
  }

  /**
   * Get the current number of pinned editors.
   */
  get pinnedCount(): number {
    let count = 0;
    for (const entry of this.editors.values()) {
      if (entry.isPinned) count++;
    }
    return count;
  }

  /**
   * Set the maximum number of pinned editors.
   *
   * @param max - Maximum pinned editors allowed
   */
  setMaxPinnedEditors(max: number): void {
    this.maxPinnedEditors = max;
    this.enforcePinnedLimit();
  }

  /**
   * Unpin an editor after a delay, allowing it to be evicted by LRU.
   *
   * Call this when an editor becomes hidden/inactive. The unpin is delayed
   * to avoid thrashing during rapid tab switching.
   *
   * @param editorId - The editor ID to unpin
   * @param immediate - If true, unpin immediately without delay
   */
  unpinEditor(editorId: string, immediate = false): void {
    const entry = this.editors.get(editorId);
    if (!entry) {
      return;
    }

    // Cancel any existing unpin timer
    if (entry.unpinTimer) {
      clearTimeout(entry.unpinTimer);
      entry.unpinTimer = undefined;
    }

    if (immediate) {
      entry.isPinned = false;
    } else {
      // Delay unpin to avoid thrashing during rapid tab switches
      entry.unpinTimer = setTimeout(() => {
        entry.isPinned = false;
        entry.unpinTimer = undefined;
      }, UNPIN_DELAY_MS);
    }
  }

  /**
   * Check if an editor is pinned.
   *
   * @param editorId - The editor ID
   * @returns True if the editor is pinned
   */
  isPinned(editorId: string): boolean {
    return this.editors.get(editorId)?.isPinned ?? false;
  }

  /**
   * Dispose all editors and clear the registry.
   *
   * Used during shutdown or testing cleanup.
   */
  disposeAll(): void {
    for (const [editorId, entry] of this.editors) {
      try {
        // Clear any pending unpin timer
        if (entry.unpinTimer) {
          clearTimeout(entry.unpinTimer);
        }
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
      isPinned: true, // New editors start pinned (they're being actively used)
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
   * Pinned editors are protected from eviction. Remaining editors are sorted
   * by lastUsed timestamp, and the oldest ones are disposed until we're at
   * or below the limit.
   */
  private evictLRU(): void {
    if (this.editors.size <= this.maxEditors) {
      return;
    }

    // Get non-pinned entries sorted by lastUsed (oldest first)
    const candidates = Array.from(this.editors.entries())
      .filter(([, entry]) => !entry.isPinned)
      .sort(([, a], [, b]) => a.metadata.lastUsed - b.metadata.lastUsed);

    // Count how many we need to dispose
    const currentPinnedCount = this.editors.size - candidates.length;
    const targetSize = Math.max(this.maxEditors, currentPinnedCount); // Can't go below pinned count
    const toDisposeCount = this.editors.size - targetSize;

    if (toDisposeCount <= 0) {
      // All editors are pinned and we can't evict - log warning
      if (candidates.length === 0 && this.editors.size > this.maxEditors) {
        console.warn(
          `[EditorRegistry] Cannot evict: all ${this.editors.size} editors are pinned (max: ${this.maxEditors})`,
        );
      }
      return;
    }

    // Dispose oldest non-pinned editors
    const toDispose = candidates.slice(0, toDisposeCount);

    for (const [editorId] of toDispose) {
      this.disposeEditor(editorId);
    }
  }

  /**
   * Enforce the maximum pinned editors limit.
   *
   * When the number of pinned editors exceeds maxPinnedEditors,
   * force-unpin the oldest pinned editors (by lastUsed timestamp)
   * to bring the count back within limits. This prevents unbounded
   * memory growth when users keep opening new tabs.
   */
  private enforcePinnedLimit(): void {
    // Get all pinned editors sorted by lastUsed (oldest first)
    const pinnedEditors = Array.from(this.editors.entries())
      .filter(([, entry]) => entry.isPinned)
      .sort(([, a], [, b]) => a.metadata.lastUsed - b.metadata.lastUsed);

    const currentPinnedCount = pinnedEditors.length;
    if (currentPinnedCount <= this.maxPinnedEditors) {
      return;
    }

    // Calculate how many to unpin
    const toUnpinCount = currentPinnedCount - this.maxPinnedEditors;

    console.debug(
      `[EditorRegistry] Pinned limit exceeded (${currentPinnedCount}/${this.maxPinnedEditors}), unpinning ${toUnpinCount} oldest editors`,
    );

    // Unpin the oldest editors immediately (no delay)
    for (let i = 0; i < toUnpinCount; i++) {
      const [editorId, entry] = pinnedEditors[i];

      // Clear any pending unpin timer
      if (entry.unpinTimer) {
        clearTimeout(entry.unpinTimer);
        entry.unpinTimer = undefined;
      }

      entry.isPinned = false;
    }

    // After unpinning, run LRU eviction to clean up if needed
    this.evictLRU();
  }
}
