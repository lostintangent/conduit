/**
 * CanvasSidebarContent - Canvas view for the sidebar
 *
 * Renders a CanvasPane using the CWD as the pane ID, so canvas state
 * is persisted and restored per working directory (similar to how
 * the editor sidebar tracks files per CWD).
 */

import { CanvasPane } from "@/components/panes/canvas/CanvasPane";
import { useMemo } from "react";

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate the pane ID for the sidebar canvas based on CWD.
 * Canvas state is cached per directory.
 */
export const getSidebarCanvasPaneId = (cwd: string) => `sidebar-canvas-${cwd}`;

// =============================================================================
// Types
// =============================================================================

interface CanvasSidebarContentProps {
  cwd: string;
}

// =============================================================================
// Main Component
// =============================================================================

export function CanvasSidebarContent({ cwd }: CanvasSidebarContentProps) {
  const paneId = useMemo(() => getSidebarCanvasPaneId(cwd), [cwd]);

  // Construct a minimal pane object for the CanvasPane
  const pane = useMemo(
    () => ({
      id: paneId,
      type: "canvas" as const,
    }),
    [paneId],
  );

  return <CanvasPane pane={pane} paneId={paneId} onContextMenu={() => {}} />;
}
