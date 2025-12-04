/**
 * GlobalEditorContainer - Renders all EditorPaneV2 instances at app root level.
 *
 * This component implements the "global container" pattern for editor panes:
 * - All EditorPaneV2 instances are rendered here, at the app root
 * - Editors are positioned off-screen when not attached to a container
 * - When a tab becomes active, EditorPaneAnchor calls attach() to move the editor
 *
 * Key architecture:
 * - The registry creates and owns wrapper DOM elements (not React)
 * - React renders INTO these wrapper elements via createPortal()
 * - The registry can move wrapper elements freely without conflicting with React
 * - When React unmounts, it only cleans up portal contents, not the wrapper
 *
 * Benefits:
 * - Editors are never unmounted during tab switches (no React reconciliation)
 * - Monaco editor state (scroll, cursor, undo) is preserved
 * - No visual flashing during tab switches
 * - Works with tab previews and overview mode
 * - No DOM ownership conflicts with React
 *
 * @see docs/architecture/editor-global-container-plan.md
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EditorPaneRegistry, type EditorPaneConfig } from "../registry";
import { EditorPaneV2 } from "../EditorPaneV2";
import { EditorRegistry } from "../registry/EditorRegistry";

// ============================================================================
// Types
// ============================================================================

interface EditorPaneEntry {
  paneId: string;
  config: EditorPaneConfig;
}

// ============================================================================
// EditorPaneWrapper
// ============================================================================

/**
 * Wrapper component for a single EditorPaneV2 instance.
 *
 * Responsibilities:
 * - Renders EditorPaneV2 into the registry-owned wrapper element via portal
 * - Calls markReady() to signal that React has rendered
 * - Sets up layout trigger for Monaco using EditorRegistry's triggerLayout
 *
 * The key insight: React renders INTO the wrapper element (via portal),
 * but doesn't own the wrapper itself. The registry owns and moves the wrapper.
 */
function EditorPaneWrapper({
  paneId,
  config,
}: {
  paneId: string;
  config: EditorPaneConfig;
}) {
  const paneRegistry = EditorPaneRegistry.getInstance();
  const editorRegistry = EditorRegistry.getInstance();

  // Get the registry-owned wrapper element to render into
  const wrapperElement = paneRegistry.getWrapperElement(paneId);

  // Mark the pane as ready when React renders
  useEffect(() => {
    paneRegistry.markReady(paneId);
  }, [paneId, paneRegistry]);

  // Set up layout trigger using EditorRegistry's debounced triggerLayout
  useEffect(() => {
    const triggerLayout = () => {
      // Trigger layout on the editor for this pane
      // The editorId follows the convention: editor-{paneId}
      const editorId = `editor-${paneId}`;

      // Use EditorRegistry's triggerLayout for proper debouncing
      // and requestAnimationFrame coordination
      editorRegistry.triggerLayout(editorId, false);
    };

    paneRegistry.setLayoutTrigger(paneId, triggerLayout);

    return () => {
      paneRegistry.setLayoutTrigger(paneId, undefined);
    };
  }, [paneId, paneRegistry, editorRegistry]);

  // If wrapper doesn't exist (disposed), don't render
  if (!wrapperElement) {
    return null;
  }

  // Render INTO the registry-owned wrapper element via portal
  // React doesn't own the wrapper, so no DOM conflicts when registry moves it
  return createPortal(
    <EditorPaneV2
      pane={config.pane}
      onFileChange={config.onFileChange}
      onClearFile={config.onClearFile}
      onCwdChange={config.onCwdChange}
      onFileOpen={config.onFileOpen}
      onTreeModeChange={config.onTreeModeChange}
      onSave={config.onSave}
    />,
    wrapperElement,
  );
}

// ============================================================================
// GlobalEditorContainer
// ============================================================================

/**
 * Global container for all EditorPaneV2 instances.
 *
 * Renders at app root level and manages all editor panes globally.
 * Each EditorPaneWrapper renders into its registry-owned wrapper element via portal.
 *
 * Architecture:
 * 1. Registry creates wrapper DOM elements when panes are registered
 * 2. GlobalEditorContainer tracks pane state via registry events
 * 3. EditorPaneWrapper renders INTO registry-owned wrappers via createPortal
 * 4. Registry can move wrapper elements freely (attach/detach) without React conflicts
 */
export function GlobalEditorContainer() {
  const [panes, setPanes] = useState<EditorPaneEntry[]>([]);
  const registry = EditorPaneRegistry.getInstance();

  // Subscribe to registry events
  useEffect(() => {
    // Initialize with current panes
    const currentPanes = registry.getAll().map((entry) => ({
      paneId: entry.paneId,
      config: entry.config,
    }));
    setPanes(currentPanes);

    // Subscribe to changes
    const subscription = registry.onEvent((event) => {
      switch (event.type) {
        case "paneAdded":
          setPanes((prev) => [
            ...prev,
            { paneId: event.paneId, config: event.config },
          ]);
          break;

        case "paneRemoved":
          setPanes((prev) => prev.filter((p) => p.paneId !== event.paneId));
          break;

        case "paneUpdated":
          setPanes((prev) =>
            prev.map((p) =>
              p.paneId === event.paneId
                ? { paneId: event.paneId, config: event.config }
                : p,
            ),
          );
          break;

        // Attach/detach/visibility events don't require re-render
        // DOM manipulation is handled by the registry
        default:
          break;
      }
    });

    return () => {
      subscription.dispose();
    };
  }, [registry]);

  // Don't render anything if no panes
  if (panes.length === 0) {
    return null;
  }

  // Render EditorPaneWrappers - each one portals into its registry-owned element
  // No outer portal needed since each wrapper manages its own portal
  return (
    <>
      {panes.map((pane) => (
        <EditorPaneWrapper
          key={pane.paneId}
          paneId={pane.paneId}
          config={pane.config}
        />
      ))}
    </>
  );
}
