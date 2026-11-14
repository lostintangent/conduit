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

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { applicationModeAtom } from "@/store/atoms";
import { sidebarStateAtom, type SidebarView } from "@/store/sidebarStore";
import { useAtom, useSelector } from "@tanstack/react-store";
import { Activity, useCallback, useEffect, useRef, useState } from "react";
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

  const applicationMode = useSelector(applicationModeAtom);

  // Maximized state (full width) - not persisted, resets on close
  const [isMaximized, setIsMaximized] = useState(false);

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

  // Reset maximized and locked state when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setIsMaximized(false);
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

  const toggleMaximized = useCallback(
    () => setIsMaximized((prev) => !prev),
    [],
  );

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

  // Content visibility for Activity - coordinates with slide animation:
  // - Opening: show content immediately (visible during slide-in)
  // - Closing: keep content visible until slide-out completes, then hide
  const [isContentVisible, setIsContentVisible] = useState(false);

  useEffect(() => {
    if (isOpen) setIsContentVisible(true);
  }, [isOpen]);

  const handleTransitionEnd = useCallback(() => {
    if (!isOpen) setIsContentVisible(false);
  }, [isOpen]);

  return (
    <ResizablePanel
      storageKey={SIDEBAR_WIDTH_STORAGE_KEY}
      isOpen={isOpen}
      isMaximized={isMaximized}
      defaultWidthPercent={0.5}
      onTransitionEnd={handleTransitionEnd}
    >
      <Activity mode={isContentVisible ? "visible" : "hidden"}>
        <div className="flex h-full">
          {/* Activity Bar */}
          <SidebarActivityBar
            view={view}
            onViewChange={setView}
            isLocked={isLocked}
            onLockToggle={toggleLocked}
            isMaximized={isMaximized}
            onMaximizeToggle={toggleMaximized}
            onClose={closeSidebar}
          />

          {/* Content */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <ErrorBoundary resetKey={view}>
              {view === "editor" ? (
                <EditorView cwd={effectiveCwd} />
              ) : view === "browser" ? (
                <BrowserView cwd={effectiveCwd} />
              ) : (
                <CanvasView cwd={effectiveCwd} isLocked={true} />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </Activity>
    </ResizablePanel>
  );
}
