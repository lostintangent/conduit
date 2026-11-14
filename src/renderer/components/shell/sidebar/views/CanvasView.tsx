/**
 * CanvasView - Canvas view for the sidebar
 *
 * Renders a CanvasPane with support for locked/unlocked modes:
 * - Unlocked: Per-CWD pane ID, canvas state is specific to each directory
 * - Locked: Global pane ID, canvas state persists across CWD changes
 *
 * When transitioning between modes, canvas state is migrated to preserve content.
 */

import { CanvasPane } from "@features/canvas/components/CanvasPane";
import { migrateCanvasState } from "@features/canvas/client/canvasStore";
import { sidebarPaneIds } from "@/store/sidebarStore";
import { noop } from "@/utils";
import { useEffect, useMemo, useRef } from "react";

interface CanvasViewProps {
  cwd: string;
  isLocked: boolean;
}

export function CanvasView({ cwd, isLocked }: CanvasViewProps) {
  // Determine pane ID based on lock state
  const paneId = useMemo(
    () =>
      isLocked
        ? sidebarPaneIds.canvas.global()
        : sidebarPaneIds.canvas.forCwd(cwd),
    [cwd, isLocked],
  );

  // Track previous state for migration
  const prevStateRef = useRef({ cwd, isLocked, paneId });

  // Migrate canvas state when lock state changes
  useEffect(() => {
    const prev = prevStateRef.current;

    // Only migrate if lock state changed (not just CWD)
    if (prev.isLocked !== isLocked && prev.paneId !== paneId) {
      migrateCanvasState(prev.paneId, paneId, true);
    }

    prevStateRef.current = { cwd, isLocked, paneId };
  }, [cwd, isLocked, paneId]);

  // Construct a minimal pane object for the CanvasPane
  const pane = useMemo(
    () => ({
      id: paneId,
      type: "canvas" as const,
    }),
    [paneId],
  );

  return <CanvasPane pane={pane} paneId={paneId} onContextMenu={noop} />;
}
