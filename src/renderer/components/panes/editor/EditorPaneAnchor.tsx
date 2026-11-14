/**
 * EditorPaneAnchor - Lightweight anchor component for EditorPaneV2 placement.
 *
 * This component implements the "anchor" pattern for the global editor container:
 * - Renders a container div that marks where an editor should appear
 * - On mount: registers with EditorPaneRegistry and attaches the editor DOM
 * - On unmount: detaches the editor (moves off-screen, not destroyed)
 *
 * This enables editors to be kept alive across tab switches without
 * React component remounting, preventing visual flashing and state loss.
 *
 * @example
 * ```tsx
 * // Instead of rendering EditorPaneV2 directly:
 * <EditorPaneAnchor
 *   paneId="editor-1"
 *   pane={paneConfig}
 *   onFileChange={handleFileChange}
 * />
 * ```
 */

import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import type { EditorPane } from "@/types";
import type { ChangesViewMode } from "@shared/types";
import { useEffect, useRef } from "react";
import type { FileChangeData } from "./EditorPaneV2";
import { EditorPaneRegistry, type EditorPaneConfig } from "./registry";
import {
  findEditorInput,
  findTreeSide,
  findTreeTabStop,
} from "./utils/focusTargets";

export interface EditorPaneAnchorProps {
  /**
   * Unique identifier for this editor pane.
   * Used to track the pane in EditorPaneRegistry.
   */
  paneId: string;

  /**
   * Editor pane configuration (cwd, filePath, etc.)
   */
  pane: EditorPane;

  /**
   * Callback fired when the selected file changes.
   */
  onFileChange?: (fileData: FileChangeData) => void;

  /**
   * Callback fired when the file selection is cleared.
   */
  onClearFile?: () => void;

  /**
   * Callback fired when the working directory changes.
   */
  onCwdChange?: (cwd: string) => void;

  /**
   * Callback fired when tree view mode changes.
   */
  onTreeModeChange?: (mode: "all" | "changes") => void;

  /**
   * Callback fired when changes view mode changes.
   */
  onChangesViewModeChange?: (mode: ChangesViewMode) => void;

  /**
   * Callback fired after a successful file save.
   */
  onSave?: () => void;

  /**
   * Callback fired when hover state changes on the editor.
   *
   * Required for design mode hover detection. Since EditorPaneV2 renders via
   * portal, standard mouse events don't bubble to parent components. This
   * callback propagates hover state from the editor back to the layout system.
   */
  onHover?: (isHovering: boolean) => void;

  /**
   * Hide the file tree and only show the editor.
   * Used for focused editing scenarios like commit messages.
   * @default false
   */
  hideFileTree?: boolean;

  /**
   * Hide the pane's agent session pill, because the tab shows one for all of
   * its panes.
   * @default false
   */
  hideIndividualSandboxIndicator?: boolean;

  /**
   * The tab the pane is in, which its agent session pill's actions apply to.
   * Unset for panes outside a tab.
   */
  tabId?: string;

  /**
   * Callback fired when the close button is clicked.
   * If provided, shows a close button in the editor toolbar.
   */
  onClose?: () => void;

  /**
   * Whether this anchor is in a preview context (tab hover, overview).
   * When true, an overlay is added to prevent editor interactions.
   * @default false
   */
  isInPreview?: boolean;

  /**
   * Whether this is the active pane of the active tab. When it becomes
   * active, focus returns to where it last was in this editor.
   * @default false
   */
  isActive?: boolean;

  /**
   * Additional CSS class names for the anchor container.
   */
  className?: string;
}

/**
 * Anchor component that marks where an EditorPaneV2 should appear.
 *
 * The actual editor content is rendered in GlobalEditorContainer and
 * moved to this anchor's container when mounted.
 */
export function EditorPaneAnchor({
  paneId,
  pane,
  onFileChange,
  onClearFile,
  onCwdChange,
  onTreeModeChange,
  onChangesViewModeChange,
  onSave,
  onHover,
  hideFileTree,
  hideIndividualSandboxIndicator,
  tabId,
  onClose,
  isInPreview = false,
  isActive = false,
  className,
}: EditorPaneAnchorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const registry = EditorPaneRegistry.getInstance();

  // Focus goes back to where it last was if that's still showing (a narrow
  // pane shows the tree or the editor, not both), and otherwise to the editor.
  // The tree is a last resort once the pane has settled, since a revealed tab
  // can show only the tree for a few frames. Its side takes focus itself when
  // it has no tab stop, like the changes view.
  useFocusWhenActive(isActive, containerRef, (settled) => {
    const container = containerRef.current;
    if (!container) return;

    const lastFocused = registry.get(paneId)?.lastFocused;
    const canReturn =
      lastFocused &&
      container.contains(lastFocused) &&
      lastFocused.checkVisibility();
    const target =
      (canReturn ? lastFocused : null) ??
      findEditorInput(container) ??
      (settled || !lastFocused
        ? (findTreeTabStop(container) ?? findTreeSide(container))
        : null);
    target?.focus({ preventScroll: true });
  });

  // Build config object for registry
  // Use refs to keep callbacks stable
  const callbacksRef = useRef({
    onFileChange,
    onClearFile,
    onCwdChange,
    onTreeModeChange,
    onChangesViewModeChange,
    onSave,
    onHover,
    onClose,
  });

  // Update callback refs when props change
  useEffect(() => {
    callbacksRef.current = {
      onFileChange,
      onClearFile,
      onCwdChange,
      onTreeModeChange,
      onChangesViewModeChange,
      onSave,
      onHover,
      onClose,
    };
  }, [
    onFileChange,
    onClearFile,
    onCwdChange,
    onTreeModeChange,
    onChangesViewModeChange,
    onSave,
    onHover,
    onClose,
  ]);

  // Create stable callback wrappers
  const stableCallbacks = useRef<EditorPaneConfig>({
    pane,
    onFileChange: (data) => callbacksRef.current.onFileChange?.(data),
    onClearFile: () => callbacksRef.current.onClearFile?.(),
    onCwdChange: (cwd) => callbacksRef.current.onCwdChange?.(cwd),
    onTreeModeChange: (mode) => callbacksRef.current.onTreeModeChange?.(mode),
    onChangesViewModeChange: (mode) =>
      callbacksRef.current.onChangesViewModeChange?.(mode),
    onSave: () => callbacksRef.current.onSave?.(),
    onHover: (isHovering) => callbacksRef.current.onHover?.(isHovering),
    onClose: () => callbacksRef.current.onClose?.(),
    hideFileTree,
    hideIndividualSandboxIndicator,
    tabId,
  });

  // Update pane in stable callbacks when it changes
  useEffect(() => {
    stableCallbacks.current.pane = pane;
    // Update registry with new pane config
    registry.updateConfig(paneId, { pane });
  }, [pane, paneId, registry]);

  // Update what the pane hides, and its tab, in stable callbacks when they
  // change
  useEffect(() => {
    stableCallbacks.current.hideFileTree = hideFileTree;
    stableCallbacks.current.hideIndividualSandboxIndicator =
      hideIndividualSandboxIndicator;
    stableCallbacks.current.tabId = tabId;
    registry.updateConfig(paneId, {
      hideFileTree,
      hideIndividualSandboxIndicator,
      tabId,
    });
  }, [hideFileTree, hideIndividualSandboxIndicator, tabId, paneId, registry]);

  // Register with registry and attach/detach
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Register pane with registry (creates entry if doesn't exist)
    registry.getOrCreate(paneId, stableCallbacks.current);

    // Attach editor DOM to this container
    registry.attach(paneId, container);

    // Cleanup: detach but don't dispose (editor stays alive)
    return () => {
      registry.detach(paneId);
    };
  }, [paneId, registry, isInPreview]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-editor-pane-anchor={paneId}
      data-in-preview={isInPreview}
      style={{
        // Fill the parent container
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Preview mode overlay - prevents editor interactions */}
      {isInPreview && (
        <div
          className="absolute inset-0 z-10"
          style={{
            // Transparent overlay to capture mouse events
            pointerEvents: "auto",
            cursor: "pointer",
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ============================================================================
// Cleanup Helper
// ============================================================================

/**
 * Dispose an editor pane from the registry.
 * Call this when a tab/pane is permanently closed.
 *
 * Note: EditorPaneAnchor.unmount only detaches (moves off-screen).
 * This function fully removes the pane from the registry.
 *
 * @param paneId - The pane ID to dispose
 */
export function disposeEditorPane(paneId: string): void {
  const registry = EditorPaneRegistry.getInstance();
  registry.dispose(paneId);
}
