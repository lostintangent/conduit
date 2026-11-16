import { useSettings } from "@features/settings/client/queries";
import { ApplicationCommands } from "@shared/commands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import { TabPreviewOverlay } from "@features/workbench/components/layout/overview/TabPreviewOverlay";
import { LaunchAgentsButton } from "@features/agents/components/LaunchAgentsButton";
import { TabButton } from "@features/workbench/components/tabs/TabButton";
import { TabPlaceholder } from "@features/workbench/components/tabs/TabPlaceholder";
import { SplitButton } from "@features/workbench/components/tabs/SplitButton";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/ui/dropdown-menu";
import { Separator } from "@/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import {
  createHyperTerminal,
  restoreMinimizedHyperTerminals,
} from "@features/workbench/client/actions/hyperTerminal";
import {
  focusTab,
  getActiveTabCwd,
  moveTab,
  openTab,
  openTabWithPane,
} from "@features/workbench/client/actions/tab";
import {
  activeTabAtom,
  activeTabIdAtom,
  applicationModeAtom,
  hyperTerminalsAtom,
  setApplicationMode,
  stripTabsAtom,
} from "@features/workbench/client/atoms";
import type { TabPosition } from "@features/settings/model";
import { shallow, useSelector } from "@tanstack/react-store";
import {
  Code,
  Fullscreen,
  Globe,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  PanelRightOpen,
  PlusSquare,
  SquareDashedMousePointer,
  SquareTerminal,
  Terminal,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

// What a new tab can start with, a page first since New Tab's own is a terminal
const NEW_TAB_PANES = [
  { type: "browser", name: "Browser", Icon: Globe },
  { type: "editor", name: "Editor", Icon: Code },
  { type: "canvas", name: "Canvas", Icon: Palette },
  { type: "terminal", name: "Terminal", Icon: Terminal },
] as const;

type TabStripProps = {
  onTabContextMenu?: (event: React.MouseEvent, tabId: string) => void;
  position?: TabPosition;
};

// Where the dragged tab's placeholder goes among the tabs that aren't being dragged.
function getTabDragLayout(
  tabIds: string[],
  draggingTab: { id: string; originalIndex: number } | null,
  dropTargetIndex: number | null,
) {
  if (!draggingTab) {
    return {
      reorderableTabIds: tabIds,
      placeholderIndex: null,
      nonDraggingIndexById: {} as Record<string, number>,
    };
  }

  const reorderableTabIds = tabIds.filter((id) => id !== draggingTab.id);
  const nonDraggingIndexById = reorderableTabIds.reduce<Record<string, number>>(
    (acc, id, index) => {
      acc[id] = index;
      return acc;
    },
    {},
  );

  const baseIndex = Math.max(0, draggingTab.originalIndex);
  const fallbackIndex = Math.min(baseIndex, reorderableTabIds.length);
  const clampedTarget = Math.max(
    0,
    Math.min(dropTargetIndex ?? fallbackIndex, reorderableTabIds.length),
  );
  const placeholderIndex =
    clampedTarget === fallbackIndex ? null : clampedTarget;

  return {
    reorderableTabIds,
    placeholderIndex,
    nonDraggingIndexById,
  };
}

export const TabStrip = ({
  onTabContextMenu,
  position = "top",
}: TabStripProps) => {
  // Each tab's button selects its own label
  const tabIds = useSelector(
    stripTabsAtom,
    (tabs) => tabs.map((tab) => tab.id),
    { compare: shallow },
  );
  const hasMultipleTabs = tabIds.length > 1;
  const activeTabId = useSelector(activeTabIdAtom);
  const hasActiveTab = useSelector(activeTabAtom, (tab) => tab !== null);
  const hyperTerminals = useSelector(hyperTerminalsAtom);
  const hasMinimizedTerminals = hyperTerminals.some(
    (t) => t.state === "minimized",
  );
  const { homeDirectory, alwaysShowTabs, showLaunchButton } = useSettings(
    (s) => ({
      homeDirectory: s.homeDirectory,
      alwaysShowTabs: s.alwaysShowTabs,
      showLaunchButton: s.showLaunchButton,
    }),
  );
  const applicationMode = useSelector(applicationModeAtom);
  const isDesignMode = applicationMode === "design";
  const isInFocusMode = applicationMode === "focus";

  // Interactive tab preview state
  // The preview shows a scaled-down version of a tab when hovering over its button.
  // Users can move their mouse into the preview and click on individual panes to
  // switch to that tab and activate the specific pane.
  const [hoverPreview, setHoverPreview] = useState<{
    tabId: string;
    left: number;
    top: number;
  } | null>(null);

  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const previewCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Command hooks for button actions
  const toggleFocusModeCmd = useCommand(
    ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
  );
  const toggleDesignModeCmd = useCommand(
    ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
  );
  const toggleSidebarCmd = useCommand(ApplicationCommands.VIEW_TOGGLE_SIDEBAR);

  const showCommandPaletteCmd = useCommand(
    ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
  );

  const newTabCmd = useCommand(ApplicationCommands.TAB_NEW);
  const quickTerminalCmd = useCommand(ApplicationCommands.TAB_QUICK_TERMINAL);
  const quickBrowserCmd = useCommand(ApplicationCommands.TAB_QUICK_BROWSER);

  const isInOverviewMode = applicationMode === "overview";

  // The strip keeps its height while a window has no tab yet, since that tab's
  // shell starts at the size its pane first fits to. Growing in under it would
  // start the shell taller than its pane.
  const collapsed = isInFocusMode || isInOverviewMode;
  const tabStripTransitionStyle: React.CSSProperties = {
    flexBasis: collapsed ? "0rem" : "2.7rem",
    minHeight: collapsed ? 0 : "2.7rem",
    opacity: collapsed ? 0 : 1,
    pointerEvents: collapsed ? "none" : "auto",
    willChange: "flex-basis, opacity",
  };

  const [draggingTab, setDraggingTab] = useState<{
    id: string;
    width: number;
    originalIndex: number;
  } | null>(null);

  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Track pane drag hover for tab switching
  const paneDragHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const paneDragHoverTabRef = useRef<string | null>(null);

  const clearPaneDragHoverTimeout = () => {
    if (paneDragHoverTimeoutRef.current) {
      clearTimeout(paneDragHoverTimeoutRef.current);
      paneDragHoverTimeoutRef.current = null;
    }
    paneDragHoverTabRef.current = null;
  };

  const clearPreviewCloseTimeout = () => {
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current);
      previewCloseTimeoutRef.current = null;
    }
  };

  const clearDragState = () => {
    setDraggingTab(null);
    setDropTargetIndex(null);
    clearPaneDragHoverTimeout();
    clearPreviewCloseTimeout();
    setHoverPreview(null);
  };

  const isPaneDrag = (e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes("application/x-conduit-pane-drag");
  };

  const applyMoveDropEffect = (e: React.DragEvent<Element>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  useEffect(() => {
    if (!activeTabId || isInOverviewMode) {
      clearPreviewCloseTimeout();
      setHoverPreview(null);
      setIsPreviewHovered(false);
      return;
    }

    if (hoverPreview && hoverPreview.tabId === activeTabId) {
      setHoverPreview(null);
    }
  }, [activeTabId, hoverPreview, clearPreviewCloseTimeout, isInOverviewMode]);

  // Clear preview when entering design mode
  useEffect(() => {
    if (isDesignMode && hoverPreview) {
      clearPreviewCloseTimeout();
      setHoverPreview(null);
      setIsPreviewHovered(false);
    }
  }, [isDesignMode, hoverPreview, clearPreviewCloseTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearPreviewCloseTimeout();
    };
  }, [clearPreviewCloseTimeout]);

  // TODO: See if we can remove this code in favor of mergining it with the descriptors and tabs w/placeholders memos
  const { reorderableTabIds, placeholderIndex, nonDraggingIndexById } =
    getTabDragLayout(tabIds, draggingTab, dropTargetIndex);

  const handleDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    tabId: string,
  ) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tabId);
    }

    const { width } = e.currentTarget.getBoundingClientRect();
    const originalIndex = tabIds.indexOf(tabId);

    setDraggingTab({
      id: tabId,
      width,
      originalIndex,
    });

    setDropTargetIndex(null);
    setHoverPreview(null);
  };

  const handlePreviewHoverChange = (isHovering: boolean) => {
    if (isHovering) {
      // Mouse entered - cancel any pending close timeout
      clearPreviewCloseTimeout();
      setIsPreviewHovered(true);
    } else {
      // Mouse truly left (relatedTarget check passed) - close immediately
      setIsPreviewHovered(false);
      setHoverPreview(null);
    }
  };

  const handleTabHoverChange = (
    tabId: string,
    element: HTMLButtonElement | null,
  ) => {
    // Don't show preview while dragging or in design mode
    if (draggingTab !== null || isDesignMode) {
      return;
    }

    if (!element) {
      // Mouse left the tab button - start a delay before closing the preview
      // This gives the user time to move their mouse into the preview area
      if (!isPreviewHovered) {
        clearPreviewCloseTimeout();
        previewCloseTimeoutRef.current = setTimeout(() => {
          setHoverPreview(null);
          previewCloseTimeoutRef.current = null;
        }, 2000); // 2 second delay to give time to move mouse to preview
      }
      return;
    }

    if (tabId === activeTabId) {
      // Hovering over active tab, clear any preview
      clearPreviewCloseTimeout();
      setHoverPreview(null);
      return;
    }

    // Mouse entered a tab button - cancel any pending close and show preview immediately
    clearPreviewCloseTimeout();
    const rect = element.getBoundingClientRect();
    setHoverPreview({
      tabId,
      left: rect.left,
      top: rect.top,
    });
  };

  const handleDragOverTab = (
    event: React.DragEvent<HTMLButtonElement>,
    overTabId: string,
  ) => {
    // Check if this is a pane drag (not tab drag)
    if (isPaneDrag(event)) {
      // Handle pane drag - switch tab after 500ms hover if not already active
      if (overTabId !== activeTabId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        // Only start timeout if we're hovering over a different tab than before
        if (paneDragHoverTabRef.current !== overTabId) {
          clearPaneDragHoverTimeout();
          paneDragHoverTabRef.current = overTabId;

          paneDragHoverTimeoutRef.current = setTimeout(() => {
            focusTab(overTabId);
            clearPaneDragHoverTimeout();
          }, 500);
        }
      }
      return;
    }

    // Handle tab drag (existing tab reordering logic). External drags, like
    // files from Finder, have no dragging tab.
    if (!draggingTab || draggingTab.id === overTabId) {
      return;
    }

    applyMoveDropEffect(event);

    const rect = event.currentTarget.getBoundingClientRect();
    const isBefore = event.clientX < rect.left + rect.width / 2;
    const overIndex = reorderableTabIds.indexOf(overTabId);

    if (overIndex === -1) {
      return;
    }

    const nextIndex = isBefore ? overIndex : overIndex + 1;
    if (nextIndex !== dropTargetIndex) {
      setDropTargetIndex(nextIndex);
    }
  };

  const handleDragLeaveTab = (
    event: React.DragEvent<HTMLButtonElement>,
    tabId: string,
  ) => {
    // Only clear if we're actually leaving the tab (not moving to a child)
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    // Clear pane drag hover timeout if leaving the tab
    if (paneDragHoverTabRef.current === tabId) {
      clearPaneDragHoverTimeout();
    }
  };

  const handleDrop = (e: React.DragEvent<Element>) => {
    e.preventDefault();

    if (
      draggingTab &&
      dropTargetIndex !== null &&
      dropTargetIndex !== draggingTab.originalIndex
    ) {
      moveTab(draggingTab.id, dropTargetIndex);
    }

    clearDragState();
    clearPaneDragHoverTimeout();
  };

  // Over the strip itself, between or after its tabs and buttons, rather
  // than over one of them
  const isOverStrip = (event: React.DragEvent<HTMLElement>) =>
    event.target === event.currentTarget ||
    event.target === tabsContainerRef.current;

  const shouldShowPlaceholder =
    draggingTab !== null && placeholderIndex !== null;

  const shouldShowTrailingPlaceholder =
    shouldShowPlaceholder && placeholderIndex === reorderableTabIds.length;

  const tabsWithPlaceholders: React.ReactNode[] = [];

  tabIds.forEach((tabId, index) => {
    const nonDraggingIndex = nonDraggingIndexById[tabId];
    const showLeadingPlaceholder =
      shouldShowPlaceholder &&
      nonDraggingIndex !== undefined &&
      nonDraggingIndex === placeholderIndex;

    if (showLeadingPlaceholder) {
      tabsWithPlaceholders.push(
        <TabPlaceholder
          key={`placeholder-${tabId}-${index}`}
          width={draggingTab?.width}
          onDragOver={applyMoveDropEffect}
          onDrop={handleDrop}
        />,
      );
    }

    // Render the tab if it's not being dragged, or if we aren't showing a placeholder
    if (tabId !== draggingTab?.id || !shouldShowPlaceholder) {
      tabsWithPlaceholders.push(
        <TabButton
          key={tabId}
          tabId={tabId}
          index={index}
          disableClick={draggingTab !== null}
          onContextMenu={onTabContextMenu}
          onDragStart={handleDragStart}
          onDragOver={handleDragOverTab}
          onDragLeave={handleDragLeaveTab}
          onDrop={handleDrop}
          onDragEnd={clearDragState}
          onHoverChange={handleTabHoverChange}
        />,
      );
    }
  });

  if (shouldShowTrailingPlaceholder) {
    tabsWithPlaceholders.push(
      <TabPlaceholder
        key="placeholder-trailing"
        width={draggingTab?.width}
        onDragOver={applyMoveDropEffect}
        onDrop={handleDrop}
      />,
    );
  }

  const handleOpenHyperTerminal = async () => {
    // If there are minimized terminals, restore them instead of opening a new one
    if (hasMinimizedTerminals) {
      restoreMinimizedHyperTerminals();
      return;
    }

    await createHyperTerminal(
      getActiveTabCwd(activeTabAtom.get(), homeDirectory),
    );
  };

  // Always opens a new hyper terminal (used in dropdown menu)
  const handleNewHyperTerminal = async () => {
    await createHyperTerminal(
      getActiveTabCwd(activeTabAtom.get(), homeDirectory),
    );
  };

  // Use margins to create gaps that reveal the overlay underneath
  // On Windows, no rounded corners (Windows 11 handles rounding)
  const marginClass = alwaysShowTabs
    ? position === "top"
      ? "mb-[1px]"
      : "mt-[1px]"
    : "";

  return (
    <>
      <div
        className={`flex items-center gap-2 px-2 bg-elevated ${marginClass} w-full min-w-0 transition-all duration-300 ease-in-out overflow-hidden`}
        style={tabStripTransitionStyle}
      >
        {/* The tabs, then the buttons after them. Only the tabs scroll, so
            the buttons can't change whether they overflow. */}
        <div
          className="flex flex-1 items-center gap-1 min-w-0"
          onDragOver={(event) => {
            if (!isOverStrip(event)) {
              return;
            }

            applyMoveDropEffect(event);
            setDropTargetIndex(reorderableTabIds.length);
          }}
          onDrop={(e) => {
            if (!isOverStrip(e)) {
              return;
            }
            handleDrop(e);
          }}
          onDragLeave={(e) => {
            const relatedTarget = e.relatedTarget;
            if (
              relatedTarget instanceof Node &&
              e.currentTarget.contains(relatedTarget)
            ) {
              return;
            }

            setDropTargetIndex(null);
          }}
        >
          {/* Each end fades while there are tabs past it */}
          <div
            ref={tabsContainerRef}
            className="flex items-stretch align-middle content-center gap-1 overflow-x-auto scrollbar-hide min-w-0 min-h-8 scroll-fade-x scroll-fade-12 [--scroll-fade-reveal:3rem] [animation-timing-function:linear]"
            role="tablist"
          >
            {tabsWithPlaceholders}
          </div>

          <Separator
            orientation="vertical"
            className="h-6 bg-elevated-border ml-2 mr-0.5 my-1 shrink-0"
          />

          {/* New tab button - after divider */}
          <SplitButton
            label={newTabCmd.title}
            tooltip={getCommandDisplayTitle(newTabCmd)}
            icon={<PlusSquare size={18} />}
            onClick={() => {
              void openTab();
            }}
            menuLabel="More new tab options"
          >
            {NEW_TAB_PANES.map(({ type, name, Icon }) => (
              <DropdownMenuItem
                key={type}
                onClick={() => void openTabWithPane(type)}
              >
                <Icon size={16} className="mr-3" />
                {`New Tab with ${name}`}
              </DropdownMenuItem>
            ))}
          </SplitButton>

          {/* Overview button - only when multiple tabs */}
          {hasMultipleTabs && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-foreground/10 shrink-0"
                  aria-label="View all tabs"
                  onClick={() => setApplicationMode("overview")}
                >
                  <LayoutGrid size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">View all tabs</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Action buttons - far right */}
        <div className="flex items-center gap-2 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-foreground/10"
                aria-label="Show command palette"
                onClick={showCommandPaletteCmd.execute}
              >
                <MoreHorizontal size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {getCommandDisplayTitle(showCommandPaletteCmd)}
            </TooltipContent>
          </Tooltip>

          {/* Quick pane split button */}
          <SplitButton
            label={
              hasMinimizedTerminals
                ? "Restore hyper terminal"
                : "Open hyper terminal"
            }
            icon={
              <>
                <SquareTerminal size={18} />
                {hasMinimizedTerminals && (
                  <span className="absolute top-1 right-0.5 w-2 h-2 rounded-full bg-[#FFBD2E]" />
                )}
              </>
            }
            onClick={handleOpenHyperTerminal}
            menuLabel="More quick pane options"
          >
            <DropdownMenuItem onClick={handleNewHyperTerminal}>
              <Zap size={16} className="mr-3" />
              Hyper Terminal
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={quickTerminalCmd.execute}>
              <Terminal size={16} className="mr-3" />
              {quickTerminalCmd.title}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={quickBrowserCmd.execute}>
              <Globe size={16} className="mr-3" />
              {quickBrowserCmd.title}
            </DropdownMenuItem>
          </SplitButton>

          <Separator
            orientation="vertical"
            className="h-6 bg-elevated-border ml-1 mr-0.5 my-1"
          />

          {/* Focus mode button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={toggleFocusModeCmd.title}
                onClick={toggleFocusModeCmd.execute}
                disabled={!hasActiveTab}
                draggable={hasActiveTab}
                onDragStart={(e) => {
                  if (!hasActiveTab) return;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(
                    "application/x-conduit-focus-mode",
                    "true",
                  );
                }}
              >
                <Fullscreen size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {getCommandDisplayTitle(toggleFocusModeCmd)}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 ${
                  isDesignMode
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                    : " hover:bg-foreground/10"
                }`}
                aria-label={toggleDesignModeCmd.title}
                onClick={toggleDesignModeCmd.execute}
              >
                <SquareDashedMousePointer size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {getCommandDisplayTitle(toggleDesignModeCmd)}
            </TooltipContent>
          </Tooltip>

          <Separator
            orientation="vertical"
            className="h-6 bg-elevated-border ml-1 mr-0.5 my-1"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-foreground/10"
                aria-label={toggleSidebarCmd.title}
                onClick={toggleSidebarCmd.execute}
              >
                <PanelRightOpen size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {getCommandDisplayTitle(toggleSidebarCmd)}
            </TooltipContent>
          </Tooltip>

          {showLaunchButton && <LaunchAgentsButton />}
        </div>
      </div>

      <TabPreviewOverlay
        preview={hoverPreview}
        onPreviewHoverChange={handlePreviewHoverChange}
      />
    </>
  );
};
