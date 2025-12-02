/**
 * GlobalEditorContainer - Renders all EditorPaneV2 instances at app root level.
 *
 * This component implements the "global container" pattern for editor panes:
 * - All EditorPaneV2 instances are rendered here, at the app root
 * - Editors are positioned off-screen when not attached to a container
 * - When a tab becomes active, EditorPaneAnchor calls attach() to move the editor
 *
 * Benefits:
 * - Editors are never unmounted during tab switches (no React reconciliation)
 * - Monaco editor state (scroll, cursor, undo) is preserved
 * - No visual flashing during tab switches
 * - Works with tab previews and overview mode
 *
 * @see docs/architecture/editor-global-container-plan.md
 */

import { useEffect, useState, useRef } from "react";
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
 * - Provides a root div that can be moved between containers
 * - Registers the root element with EditorPaneRegistry
 * - Sets up layout trigger for Monaco using EditorRegistry's triggerLayout
 */
function EditorPaneWrapper({
  paneId,
  config,
}: {
  paneId: string;
  config: EditorPaneConfig;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const paneRegistry = EditorPaneRegistry.getInstance();
  const editorRegistry = EditorRegistry.getInstance();

  // Register root element with registry
  useEffect(() => {
    if (rootRef.current) {
      paneRegistry.setRootElement(paneId, rootRef.current);
    }

    return () => {
      paneRegistry.setRootElement(paneId, null);
    };
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

  return (
    <div
      ref={rootRef}
      className="h-full w-full"
      data-editor-pane-wrapper={paneId}
      style={{
        // Ensure the wrapper fills its container
        display: "flex",
        flexDirection: "column",
      }}
    >
      <EditorPaneV2
        pane={config.pane}
        onFileChange={config.onFileChange}
        onClearFile={config.onClearFile}
        onCwdChange={config.onCwdChange}
        onFileOpen={config.onFileOpen}
        onTreeModeChange={config.onTreeModeChange}
        onSave={config.onSave}
      />
    </div>
  );
}

// ============================================================================
// GlobalEditorContainer
// ============================================================================

/**
 * Global container for all EditorPaneV2 instances.
 *
 * Renders at app root level and manages all editor panes globally.
 * Uses React portal to render into document.body.
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

  // Render all panes into a portal container
  // The actual positioning is handled by the registry's attach/detach
  return createPortal(
    <div
      id="global-editor-container"
      style={{
        // Container itself is invisible - children are moved by registry
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {panes.map((pane) => (
        <EditorPaneWrapper
          key={pane.paneId}
          paneId={pane.paneId}
          config={pane.config}
        />
      ))}
    </div>,
    document.body,
  );
}
