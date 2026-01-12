/**
 * Sidebar - A persistent panel that overlays from the right side
 *
 * Features:
 * - Slides in/out with animation (toggled via Cmd+E)
 * - Resizable width with drag handle (persisted to localStorage)
 * - Activity bar for switching between editor, browser, and canvas views
 * - CWD synced to active terminal/editor pane (when unlocked)
 * - Lock mode to freeze the sidebar at a specific CWD
 */

import { applicationModeAtom } from "@/store/atoms";
import { sidebarStateAtom, type SidebarView } from "@/store/sidebarStore";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResizablePanel } from "./ResizablePanel";
import { SidebarActivityBar } from "./SidebarActivityBar";
import { BrowserView } from "./views/BrowserView";
import { CanvasView } from "./views/CanvasView";
import { EditorView } from "./views/EditorView";

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
  const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
  const { isOpen, view } = sidebarState;

  const applicationMode = useAtomValue(applicationModeAtom);

  // Expanded state (full width) - not persisted, resets on close
  const [isExpanded, setIsExpanded] = useState(false);

  // Locked state - freezes sidebar at current CWD
  const [isLocked, setIsLocked] = useState(false);
  const [lockedCwd, setLockedCwd] = useState<string | null>(null);

  // Close sidebar when application mode changes (skip initial mount)
  const prevApplicationModeRef = useRef(applicationMode);
  useEffect(() => {
    if (prevApplicationModeRef.current !== applicationMode) {
      setSidebarState((prev) => ({ ...prev, isOpen: false }));
      prevApplicationModeRef.current = applicationMode;
    }
  }, [applicationMode, setSidebarState]);

  // Reset expanded and locked state when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
      setIsLocked(false);
      setLockedCwd(null);
    }
  }, [isOpen]);

  // When a navigation with a CWD comes in and we're locked, update the lock target
  useEffect(() => {
    const navCwd = sidebarState.navigation?.cwd;
    if (navCwd && isLocked) {
      setLockedCwd(navCwd);
    }
  }, [sidebarState.navigation, isLocked]);

  const setView = useCallback(
    (newView: SidebarView) =>
      setSidebarState((prev) => ({ ...prev, view: newView })),
    [setSidebarState],
  );

  const closeSidebar = useCallback(
    () => setSidebarState((prev) => ({ ...prev, isOpen: false })),
    [setSidebarState],
  );

  const toggleExpanded = useCallback(() => setIsExpanded((prev) => !prev), []);

  const toggleLocked = useCallback(() => {
    if (isLocked) {
      setIsLocked(false);
      setLockedCwd(null);
    } else {
      setIsLocked(true);
      setLockedCwd(cwd);
    }
  }, [isLocked, cwd]);

  // The effective CWD: locked CWD if locked, otherwise current CWD
  const effectiveCwd = isLocked && lockedCwd ? lockedCwd : cwd;

  return (
    <ResizablePanel
      storageKey={SIDEBAR_WIDTH_STORAGE_KEY}
      isOpen={isOpen}
      isExpanded={isExpanded}
      defaultWidthPercent={0.5}
    >
      <div className="flex h-full">
        {/* Activity Bar */}
        <SidebarActivityBar
          view={view}
          onViewChange={setView}
          isLocked={isLocked}
          onLockToggle={toggleLocked}
          isExpanded={isExpanded}
          onExpandToggle={toggleExpanded}
          onClose={closeSidebar}
        />

        {/* Content */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {view === "editor" ? (
            <EditorView cwd={effectiveCwd} />
          ) : view === "browser" ? (
            <BrowserView cwd={effectiveCwd} />
          ) : (
            <CanvasView cwd={effectiveCwd} isLocked={isLocked} />
          )}
        </div>
      </div>
    </ResizablePanel>
  );
}
