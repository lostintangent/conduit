/**
 * EditorPaneRegistry - Global registry for EditorPaneV2 instances.
 *
 * This singleton registry manages EditorPaneV2 component instances globally,
 * enabling the "global container" pattern where editors are kept alive and
 * moved between containers rather than unmounted/remounted.
 *
 * This solves several problems:
 * 1. Monaco editor layout issues when containers have `display: none`
 * 2. Visual flashing during tab switches
 * 3. State loss during tab switches (scroll position, undo history)
 *
 * The pattern works as follows:
 * 1. EditorPaneV2 instances are rendered in a GlobalEditorContainer at app root
 * 2. EditorPaneAnchor components mark where editors should appear
 * 3. When an anchor mounts, the registry "attaches" the editor DOM to it
 * 4. When an anchor unmounts, the registry "detaches" (moves off-screen, not destroyed)
 *
 * @see docs/architecture/editor-global-container-plan.md
 */

import type { EditorPane } from "@/types";
import type { FileChangeData } from "../EditorPaneV2";
import type { FileNode } from "../types";
import { EventEmitter } from "../utils/EventEmitter";

// ============================================================================
// Types
// ============================================================================

/**
 * Props required for an EditorPaneV2 instance.
 * This is a subset of EditorPaneV2Props that the registry tracks.
 */
export interface EditorPaneConfig {
  /** The pane configuration (cwd, filePath, etc.) */
  pane: EditorPane;

  /** Callback when file changes */
  onFileChange?: (fileData: FileChangeData) => void;

  /** Callback when file selection is cleared */
  onClearFile?: () => void;

  /** Callback when working directory changes */
  onCwdChange?: (cwd: string) => void;

  /** Callback when a file is opened from tree */
  onFileOpen?: (node: FileNode) => void;

  /** Callback when tree mode changes */
  onTreeModeChange?: (mode: "all" | "changes") => void;

  /** Callback after successful save */
  onSave?: () => void;
}

/**
 * Tracked scroll container with its saved position.
 */
interface ScrollContainerEntry {
  /**
   * The scroll container element.
   * Null when unregistered but preserving saved position for re-registration.
   */
  element: HTMLElement | null;
  /** Saved scroll position (for restoration after DOM moves) */
  savedScrollTop: number;
}

/**
 * Internal entry for tracking an EditorPane instance.
 */
interface EditorPaneEntry {
  /** Unique identifier for this pane */
  paneId: string;

  /** Current configuration/props for the pane */
  config: EditorPaneConfig;

  /** The root DOM element of the EditorPaneV2 component */
  rootElement: HTMLDivElement | null;

  /** The container the editor is currently attached to (null if detached) */
  currentContainer: HTMLElement | null;

  /**
   * Container waiting for rootElement to be set.
   * When attach() is called before rootElement is available, we store the
   * target container here. setRootElement() will complete the attachment.
   */
  pendingContainer: HTMLElement | null;

  /** Whether the editor is currently visible (attached and container visible) */
  isVisible: boolean;

  /** Timestamp when pane was created */
  createdAt: number;

  /** Timestamp when pane was last used */
  lastUsed: number;

  /** Callback to trigger Monaco layout recalculation */
  triggerLayout?: () => void;

  /**
   * Registered scroll containers for this pane.
   * Key is a unique scrollId (e.g., "fileTree", "changesTree").
   * Used to save/restore scroll positions during DOM moves.
   */
  scrollContainers: Map<string, ScrollContainerEntry>;
}

/**
 * Events emitted by the registry.
 */
export type EditorPaneRegistryEvent =
  | { type: "paneAdded"; paneId: string; config: EditorPaneConfig }
  | { type: "paneRemoved"; paneId: string }
  | { type: "paneUpdated"; paneId: string; config: EditorPaneConfig }
  | { type: "paneAttached"; paneId: string }
  | { type: "paneDetached"; paneId: string }
  | { type: "visibilityChanged"; paneId: string; isVisible: boolean };

// ============================================================================
// EditorPaneRegistry
// ============================================================================

/**
 * Singleton registry for EditorPaneV2 instances.
 *
 * Manages the lifecycle of editor panes, including:
 * - Creation and disposal
 * - Attaching/detaching from containers
 * - Visibility state tracking
 * - Layout notifications
 */
export class EditorPaneRegistry {
  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static instance: EditorPaneRegistry | null = null;

  /** Event emitter for registry changes */
  private readonly _onEvent = new EventEmitter<EditorPaneRegistryEvent>();

  /**
   * Event fired when the registry state changes.
   * Components can subscribe to re-render when panes are added/removed.
   */
  readonly onEvent = this._onEvent.event;

  /**
   * Get the singleton instance.
   */
  static getInstance(): EditorPaneRegistry {
    if (!EditorPaneRegistry.instance) {
      EditorPaneRegistry.instance = new EditorPaneRegistry();
    }
    return EditorPaneRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (EditorPaneRegistry.instance) {
      EditorPaneRegistry.instance.disposeAll();
      EditorPaneRegistry.instance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------

  /** Map of paneId to entry */
  private panes = new Map<string, EditorPaneEntry>();

  /** Off-screen container for detached editors */
  private offscreenContainer: HTMLDivElement | null = null;

  /** Private constructor - use getInstance() */
  private constructor() {
    // Create off-screen container lazily when needed
  }

  // ---------------------------------------------------------------------------
  // Off-screen Container Management
  // ---------------------------------------------------------------------------

  /**
   * Get or create the off-screen container for detached editors.
   * This container keeps editors in the DOM but invisible.
   */
  private getOffscreenContainer(): HTMLDivElement {
    if (!this.offscreenContainer) {
      this.offscreenContainer = document.createElement("div");
      this.offscreenContainer.id = "editor-pane-offscreen-container";
      this.offscreenContainer.setAttribute("aria-hidden", "true");
      // Position off-screen but keep in DOM for Monaco to function
      Object.assign(this.offscreenContainer.style, {
        position: "absolute",
        left: "-10000px",
        top: "-10000px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        pointerEvents: "none",
        visibility: "hidden",
      });
      document.body.appendChild(this.offscreenContainer);
    }
    return this.offscreenContainer;
  }

  // ---------------------------------------------------------------------------
  // Public Methods - Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Get or create an editor pane entry.
   *
   * If an entry exists, updates its config and returns it.
   * If not, creates a new entry.
   *
   * @param paneId - Unique identifier for the pane
   * @param config - Configuration for the pane
   * @returns The pane entry
   */
  getOrCreate(paneId: string, config: EditorPaneConfig): EditorPaneEntry {
    let entry = this.panes.get(paneId);

    if (entry) {
      // Update config if changed
      const configChanged =
        entry.config.pane.id !== config.pane.id ||
        entry.config.pane.cwd !== config.pane.cwd ||
        entry.config.pane.filePath !== config.pane.filePath;

      entry.config = config;
      entry.lastUsed = Date.now();

      if (configChanged) {
        this._onEvent.fire({ type: "paneUpdated", paneId, config });
      }

      return entry;
    }

    // Create new entry
    entry = {
      paneId,
      config,
      rootElement: null,
      currentContainer: null,
      pendingContainer: null,
      isVisible: false,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      scrollContainers: new Map(),
    };

    this.panes.set(paneId, entry);
    this._onEvent.fire({ type: "paneAdded", paneId, config });

    return entry;
  }

  /**
   * Check if a pane exists in the registry.
   */
  has(paneId: string): boolean {
    return this.panes.has(paneId);
  }

  /**
   * Get a pane entry by ID.
   */
  get(paneId: string): EditorPaneEntry | undefined {
    return this.panes.get(paneId);
  }

  /**
   * Get all pane entries.
   */
  getAll(): EditorPaneEntry[] {
    return Array.from(this.panes.values());
  }

  /**
   * Get all pane IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.panes.keys());
  }

  /**
   * Update the configuration for a pane.
   */
  updateConfig(paneId: string, config: Partial<EditorPaneConfig>): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    entry.config = { ...entry.config, ...config };
    entry.lastUsed = Date.now();
    this._onEvent.fire({
      type: "paneUpdated",
      paneId,
      config: entry.config,
    });
  }

  /**
   * Dispose a pane and remove it from the registry.
   * This fully cleans up the pane - use when a tab/pane is closed.
   */
  dispose(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // Remove from DOM if attached
    if (entry.rootElement?.parentElement) {
      entry.rootElement.parentElement.removeChild(entry.rootElement);
    }

    this.panes.delete(paneId);
    this._onEvent.fire({ type: "paneRemoved", paneId });
  }

  /**
   * Dispose all panes and clean up.
   */
  disposeAll(): void {
    for (const paneId of this.panes.keys()) {
      this.dispose(paneId);
    }

    // Clean up off-screen container
    if (this.offscreenContainer?.parentElement) {
      this.offscreenContainer.parentElement.removeChild(
        this.offscreenContainer,
      );
      this.offscreenContainer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public Methods - DOM Management
  // ---------------------------------------------------------------------------

  /**
   * Set the root element for a pane.
   * Called by GlobalEditorContainer when rendering the pane.
   *
   * If there's a pendingContainer (attach() was called before rootElement was
   * available), this completes the attachment.
   */
  setRootElement(paneId: string, element: HTMLDivElement | null): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    entry.rootElement = element;

    if (!element) return;

    // Check if there's a pending attachment to complete
    if (entry.pendingContainer) {
      const container = entry.pendingContainer;
      entry.pendingContainer = null;

      // Complete the attachment
      container.appendChild(element);
      entry.currentContainer = container;
      entry.lastUsed = Date.now();

      this._onEvent.fire({ type: "paneAttached", paneId });

      // Restore scroll positions after DOM move
      this.restoreScrollPositions(paneId);

      // Trigger layout after a frame to let DOM settle
      requestAnimationFrame(() => {
        this.notifyVisible(paneId);
      });
    } else if (!entry.currentContainer) {
      // No pending container, move to off-screen
      this.getOffscreenContainer().appendChild(element);
    }
  }

  /**
   * Set the layout trigger callback for a pane.
   * Called by the EditorPaneV2 component to register its layout function.
   */
  setLayoutTrigger(paneId: string, trigger: (() => void) | undefined): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    entry.triggerLayout = trigger;
  }

  // ---------------------------------------------------------------------------
  // Public Methods - Scroll Persistence
  // ---------------------------------------------------------------------------

  /**
   * Register a scroll container for a pane.
   *
   * When the pane is detached, the scroll position will be saved.
   * When the pane is attached, the scroll position will be restored.
   *
   * If the scroll container was previously registered and has a saved
   * scroll position, it will be restored to the new element.
   *
   * @param paneId - The pane ID
   * @param scrollId - Unique identifier for this scroll container (e.g., "fileTree")
   * @param container - The scrollable element
   */
  registerScrollContainer(
    paneId: string,
    scrollId: string,
    container: HTMLElement,
  ): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // Check if there's a saved scroll position from previous registration
    const existingEntry = entry.scrollContainers.get(scrollId);
    const savedScrollTop = existingEntry?.savedScrollTop ?? 0;

    entry.scrollContainers.set(scrollId, {
      element: container,
      savedScrollTop: savedScrollTop,
    });

    // Restore scroll position if we had one saved
    if (savedScrollTop > 0) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        container.scrollTop = savedScrollTop;
      });
    }
  }

  /**
   * Unregister a scroll container for a pane.
   *
   * Note: This preserves the saved scroll position so it can be restored
   * if the element is re-registered (e.g., during conditional rendering).
   *
   * @param paneId - The pane ID
   * @param scrollId - The scroll container identifier to remove
   */
  unregisterScrollContainer(paneId: string, scrollId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    const scrollEntry = entry.scrollContainers.get(scrollId);
    if (scrollEntry && scrollEntry.element) {
      // Save current scroll position before unregistering
      const currentScrollTop = scrollEntry.element.scrollTop;
      if (currentScrollTop > 0) {
        scrollEntry.savedScrollTop = currentScrollTop;
      }
      // Set element to null but keep the entry to preserve savedScrollTop
      scrollEntry.element = null;
    }
  }

  /**
   * Update the saved scroll position for a scroll container.
   * Called on every scroll event to ensure we have the latest position.
   *
   * This is critical for the global container pattern because the element
   * may be hidden (dimensions become 0) before detach() is called, making
   * it impossible to read the scroll position at detach time.
   *
   * @param paneId - The pane ID
   * @param scrollId - The scroll container identifier
   * @param scrollTop - The current scroll position
   */
  updateScrollPosition(
    paneId: string,
    scrollId: string,
    scrollTop: number,
  ): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    const scrollEntry = entry.scrollContainers.get(scrollId);
    if (scrollEntry) {
      scrollEntry.savedScrollTop = scrollTop;
    }
  }

  /**
   * Save all scroll positions for a pane.
   * Called automatically before detach.
   *
   * Note: With the scroll event listener updating positions in real-time,
   * this method is mostly a safety check. It will only update the position
   * if the element still has valid dimensions (not hidden).
   */
  private saveScrollPositions(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    for (const [_scrollId, scrollEntry] of entry.scrollContainers) {
      // Skip if element is null (was unregistered due to conditional rendering)
      if (!scrollEntry.element) continue;

      const element = scrollEntry.element;

      // If element still has dimensions, read the current scrollTop as a safety check
      // Otherwise, trust the savedScrollTop we've been updating on scroll events
      if (element.offsetHeight > 0 && element.scrollHeight > 0) {
        scrollEntry.savedScrollTop = element.scrollTop;
      }
      // If element has zero dimensions, we keep the savedScrollTop value
      // that was set during scroll events
    }
  }

  /**
   * Restore all scroll positions for a pane.
   * Called automatically after attach.
   */
  private restoreScrollPositions(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // Use requestAnimationFrame to ensure DOM has settled after the move
    requestAnimationFrame(() => {
      for (const [_scrollId, scrollEntry] of entry.scrollContainers) {
        // Skip if element is null (was unregistered due to conditional rendering)
        // The position will be restored when the element is re-registered
        if (!scrollEntry.element) continue;

        const savedScrollTop = scrollEntry.savedScrollTop;
        if (savedScrollTop > 0) {
          scrollEntry.element.scrollTop = savedScrollTop;
        }
      }
    });
  }

  /**
   * Attach a pane's DOM to a container.
   * This moves the editor from off-screen to the target container.
   *
   * If rootElement is not yet available (GlobalEditorContainer hasn't rendered),
   * the container is stored as pendingContainer. setRootElement() will complete
   * the attachment when the element becomes available.
   */
  attach(paneId: string, container: HTMLElement): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // If rootElement not yet available, store as pending
    // setRootElement() will complete the attachment
    if (!entry.rootElement) {
      entry.pendingContainer = container;
      return;
    }

    // Clear any pending container since we're attaching now
    entry.pendingContainer = null;

    // Already attached to this container
    if (entry.currentContainer === container) {
      return;
    }

    // Move to new container
    container.appendChild(entry.rootElement);
    entry.currentContainer = container;
    entry.lastUsed = Date.now();

    this._onEvent.fire({ type: "paneAttached", paneId });

    // Restore scroll positions after DOM move
    this.restoreScrollPositions(paneId);

    // Trigger layout after a frame to let DOM settle
    requestAnimationFrame(() => {
      this.notifyVisible(paneId);
    });
  }

  /**
   * Detach a pane's DOM from its container.
   * Moves the editor to off-screen container (not destroyed).
   */
  detach(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry || !entry.rootElement) {
      return;
    }

    // Already detached
    if (!entry.currentContainer) {
      return;
    }

    // Save scroll positions BEFORE moving (DOM move resets scroll)
    this.saveScrollPositions(paneId);

    // Move to off-screen container
    this.getOffscreenContainer().appendChild(entry.rootElement);
    entry.currentContainer = null;
    entry.isVisible = false;

    this._onEvent.fire({ type: "paneDetached", paneId });
    this._onEvent.fire({ type: "visibilityChanged", paneId, isVisible: false });
  }

  // ---------------------------------------------------------------------------
  // Public Methods - Visibility
  // ---------------------------------------------------------------------------

  /**
   * Notify that a pane has become visible.
   * Triggers Monaco layout recalculation.
   */
  notifyVisible(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    const wasVisible = entry.isVisible;
    entry.isVisible = true;
    entry.lastUsed = Date.now();

    // Trigger layout
    entry.triggerLayout?.();

    if (!wasVisible) {
      this._onEvent.fire({
        type: "visibilityChanged",
        paneId,
        isVisible: true,
      });
    }
  }

  /**
   * Notify that a pane has become hidden.
   * Can be used to pause expensive operations.
   */
  notifyHidden(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    const wasVisible = entry.isVisible;
    entry.isVisible = false;

    if (wasVisible) {
      this._onEvent.fire({
        type: "visibilityChanged",
        paneId,
        isVisible: false,
      });
    }
  }

  /**
   * Check if a pane is currently visible.
   */
  isVisible(paneId: string): boolean {
    return this.panes.get(paneId)?.isVisible ?? false;
  }

  // ---------------------------------------------------------------------------
  // Debug / Stats
  // ---------------------------------------------------------------------------

  /**
   * Get the current pane count.
   */
  get paneCount(): number {
    return this.panes.size;
  }

  /**
   * Get debug info about all panes.
   */
  getDebugInfo(): Array<{
    paneId: string;
    isAttached: boolean;
    isVisible: boolean;
    cwd: string;
    filePath?: string;
  }> {
    return Array.from(this.panes.values()).map((entry) => ({
      paneId: entry.paneId,
      isAttached: entry.currentContainer !== null,
      isVisible: entry.isVisible,
      cwd: entry.config.pane.cwd,
      filePath: entry.config.pane.filePath,
    }));
  }
}
