/**
 * Sidebar - A persistent panel that overlays from the right side
 *
 * Features:
 * - Slides in/out with animation (toggled via Cmd+E)
 * - Resizable width with drag handle (persisted to localStorage)
 * - Activity bar for switching between editor and canvas views
 * - CWD synced to active terminal/editor pane
 */

import {
  applicationModeAtom,
  isSidebarOpenAtom,
  sidebarViewAtom,
} from "@/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { CanvasSidebarContent } from "./CanvasSidebarContent";
import { EditorSidebarContent } from "./EditorSidebarContent";
import { ResizablePanel } from "./ResizablePanel";
import { SidebarActivityBar } from "./SidebarActivityBar";

// =============================================================================
// Constants
// =============================================================================

const SIDEBAR_WIDTH_STORAGE_KEY = "sidebar-width-percent";

// =============================================================================
// Types
// =============================================================================

interface SidebarProps {
  cwd: string;
}

// =============================================================================
// Main Component
// =============================================================================

export function Sidebar({ cwd }: SidebarProps) {
  // Sidebar visibility state
  const isOpen = useAtomValue(isSidebarOpenAtom);
  const setIsOpen = useSetAtom(isSidebarOpenAtom);
  const applicationMode = useAtomValue(applicationModeAtom);

  // Close sidebar when application mode changes (skip initial mount)
  const prevApplicationModeRef = useRef(applicationMode);
  useEffect(() => {
    if (prevApplicationModeRef.current !== applicationMode) {
      setIsOpen(false);
      prevApplicationModeRef.current = applicationMode;
    }
  }, [applicationMode, setIsOpen]);

  // View selection from atom
  const [view, setView] = useAtom(sidebarViewAtom);

  const closeSidebar = () => setIsOpen(false);

  return (
    <ResizablePanel
      storageKey={SIDEBAR_WIDTH_STORAGE_KEY}
      isOpen={isOpen}
      defaultWidthPercent={0.5}
    >
      <div className="flex h-full">
        {/* Activity Bar */}
        <SidebarActivityBar
          view={view}
          onViewChange={setView}
          onClose={closeSidebar}
        />

        {/* Content */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {view === "editor" ? (
            <EditorSidebarContent cwd={cwd} />
          ) : (
            <CanvasSidebarContent cwd={cwd} />
          )}
        </div>
      </div>
    </ResizablePanel>
  );
}
