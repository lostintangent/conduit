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
import type { ChangesViewMode } from "@shared/types";
import type { FileChangeData } from "../EditorPaneV2";
import { EventEmitter } from "@shared/EventEmitter";

/**
 * Props required for an EditorPaneV2 instance.
 * This is a subset of EditorPaneV2Props that the registry tracks.
 */
export interface EditorPaneConfig {
  /** The pane configuration (cwd, filePath, changesViewMode, etc.) */
  pane: EditorPane;

  /** Callback when file changes */
  onFileChange?: (fileData: FileChangeData) => void;

  /** Callback when file selection is cleared */
  onClearFile?: () => void;

  /** Callback when working directory changes */
  onCwdChange?: (cwd: string) => void;

  /** Callback when tree mode changes */
  onTreeModeChange?: (mode: "all" | "changes") => void;

  /** Callback when changes view mode changes */
  onChangesViewModeChange?: (mode: ChangesViewMode) => void;

  /** Callback after successful save */
  onSave?: () => void;

  /**
   * Callback when hover state changes on the editor.
   * Required for design mode since portal-rendered content doesn't
   * propagate mouse events to parent React components.
   */
  onHover?: (isHovering: boolean) => void;

  /**
   * Hide the file tree and only show the editor.
   * Used for focused editing scenarios like commit messages.
   */
  hideFileTree?: boolean;

  /**
   * Callback when close button is clicked.
   * If provided, shows a close button in the editor toolbar.
   */
  onClose?: () => void;
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

  /**
   * The wrapper DOM element that the registry owns and can move freely.
   * This element is created by the registry (not React) so we can move it
   * between containers without conflicting with React's DOM management.
   * React renders INTO this element via a portal.
   */
  wrapperElement: HTMLDivElement;

  /** The container the editor is currently attached to (null if detached/off-screen) */
  currentContainer: HTMLElement | null;

  /**
   * Container waiting for React to render into wrapperElement.
   * When attach() is called before React has rendered, we store the
   * target container here. Once React renders and calls markReady(),
   * we complete the attachment.
   */
  pendingContainer: HTMLElement | null;

  /** Whether React has rendered content into the wrapper */
  isReady: boolean;

  /**
   * Registered scroll containers for this pane.
   * Key is a unique scrollId (e.g., "fileTree", "changesTree").
   * Used to save/restore scroll positions during DOM moves.
   */
  scrollContainers: Map<string, ScrollContainerEntry>;

  /**
   * The element in this pane that last had focus. It lives here rather than
   * in the anchor, which remounts on every tab switch.
   */
  lastFocused: HTMLElement | null;
}

/**
 * Events emitted by the registry.
 */
export type EditorPaneRegistryEvent =
  | { type: "paneAdded"; paneId: string; config: EditorPaneConfig }
  | { type: "paneRemoved"; paneId: string }
  | { type: "paneUpdated"; paneId: string; config: EditorPaneConfig };

// ============================================================================
// EditorPaneRegistry
// ============================================================================

/**
 * Singleton registry for EditorPaneV2 instances.
 *
 * Manages the lifecycle of editor panes, including:
 * - Creation and disposal
 * - Attaching/detaching from containers
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
   * If not, creates a new entry with a wrapper element.
   *
   * The wrapper element is created and owned by the registry (not React),
   * allowing us to move it freely between containers without conflicting
   * with React's DOM management.
   *
   * @param paneId - Unique identifier for the pane
   * @param config - Configuration for the pane
   * @returns The pane entry
   */
  getOrCreate(paneId: string, config: EditorPaneConfig): EditorPaneEntry {
    const entry = this.panes.get(paneId);

    if (entry) {
      // Update config if changed
      const configChanged =
        entry.config.pane.id !== config.pane.id ||
        entry.config.pane.cwd !== config.pane.cwd ||
        entry.config.pane.file !== config.pane.file;

      entry.config = config;

      if (configChanged) {
        this._onEvent.fire({ type: "paneUpdated", paneId, config });
      }

      return entry;
    }

    // Create wrapper element that the registry owns
    // This element can be moved freely without conflicting with React
    const wrapperElement = document.createElement("div");
    wrapperElement.setAttribute("data-editor-pane-wrapper", paneId);
    wrapperElement.style.cssText =
      "height: 100%; width: 100%; display: flex; flex-direction: column;";

    // Start in off-screen container
    this.getOffscreenContainer().appendChild(wrapperElement);

    // Create new entry
    const created: EditorPaneEntry = {
      paneId,
      config,
      wrapperElement,
      currentContainer: null,
      pendingContainer: null,
      isReady: false,
      scrollContainers: new Map(),
      lastFocused: null,
    };

    wrapperElement.addEventListener("focusin", (event) => {
      created.lastFocused = event.target as HTMLElement;
    });

    this.panes.set(paneId, created);
    this._onEvent.fire({ type: "paneAdded", paneId, config });

    return created;
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
   * Get the wrapper element for a pane.
   * React should render INTO this element via createPortal().
   * The registry owns this element and can move it freely.
   */
  getWrapperElement(paneId: string): HTMLDivElement | null {
    return this.panes.get(paneId)?.wrapperElement ?? null;
  }

  /**
   * Mark a pane as ready (React has rendered content into it).
   * If there's a pending container, completes the attachment.
   */
  markReady(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry || entry.isReady) return;

    entry.isReady = true;

    // Check if there's a pending attachment to complete
    if (entry.pendingContainer) {
      const container = entry.pendingContainer;
      entry.pendingContainer = null;

      // Complete the attachment
      container.appendChild(entry.wrapperElement);
      entry.currentContainer = container;

      // Restore scroll positions after DOM move
      this.restoreScrollPositions(paneId);
    }
  }

  /**
   * Update the configuration for a pane.
   */
  updateConfig(paneId: string, config: Partial<EditorPaneConfig>): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    entry.config = { ...entry.config, ...config };
    this._onEvent.fire({
      type: "paneUpdated",
      paneId,
      config: entry.config,
    });
  }

  /**
   * Dispose a pane and remove it from the registry.
   * This fully cleans up the pane - use when a tab/pane is closed.
   *
   * The registry owns the wrapper element, so we remove it from the DOM here.
   * React renders INTO the wrapper via portal, so removing the wrapper
   * will cause React to unmount the portal contents cleanly.
   */
  dispose(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // Remove wrapper element from DOM (registry owns it)
    if (entry.wrapperElement.parentElement) {
      entry.wrapperElement.parentElement.removeChild(entry.wrapperElement);
    }

    // Clear references
    entry.currentContainer = null;
    entry.pendingContainer = null;

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
   * If React hasn't rendered into the wrapper yet (isReady is false),
   * the container is stored as pendingContainer. markReady() will complete
   * the attachment when React renders.
   */
  attach(paneId: string, container: HTMLElement): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // If React hasn't rendered yet, store as pending
    // markReady() will complete the attachment
    if (!entry.isReady) {
      entry.pendingContainer = container;
      return;
    }

    // Clear any pending container since we're attaching now
    entry.pendingContainer = null;

    // Already attached to this container
    if (entry.currentContainer === container) {
      return;
    }

    // Move wrapper to new container
    container.appendChild(entry.wrapperElement);
    entry.currentContainer = container;

    // Restore scroll positions after DOM move
    this.restoreScrollPositions(paneId);
  }

  /**
   * Detach a pane's DOM from its container.
   * Moves the editor to off-screen container (not destroyed).
   */
  detach(paneId: string): void {
    const entry = this.panes.get(paneId);
    if (!entry) return;

    // Already detached
    if (!entry.currentContainer) {
      return;
    }

    // Save scroll positions BEFORE moving (DOM move resets scroll)
    this.saveScrollPositions(paneId);

    // Move wrapper to off-screen container
    this.getOffscreenContainer().appendChild(entry.wrapperElement);
    entry.currentContainer = null;
  }
}
