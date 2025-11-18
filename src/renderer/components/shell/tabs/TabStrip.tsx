import { ApplicationCommands } from "@/commands/applicationCommands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import type { PaneDescriptor } from "@/components/shell/QuickDialog";
import { TabPreviewOverlay } from "@/components/shell/tabs/preview/TabPreviewOverlay";
import { RepositoryDialog } from "@/components/shell/tabs/RepositoryDialog";
import { TabButton, TabPlaceholder } from "@/components/shell/tabs/TabButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  dismissNotification,
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import {
  focusTab,
  getActiveTabCwd,
  moveTab,
  openTab,
} from "@/store/actions/tab";
import {
  activeTabAtom,
  activeTabIdAtom,
  applicationModeAtom,
  tabsAtom,
  userSettingsAtom,
} from "@/store/atoms";
import { tabLabelsAtom, type TabLabelDescriptor } from "@/store/tabLabels";
import { useAtom, useAtomValue } from "jotai";
import {
  ChevronDown,
  Cloud,
  FolderTree,
  Fullscreen,
  LayoutGrid,
  MoreHorizontal,
  PlusSquare,
  SquareDashedMousePointer,
  SquareTerminal,
  Terminal,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TabDescriptor = TabLabelDescriptor;

type TabStripProps = {
  onOpenCommandPalette?: () => void;
  onTabContextMenu?: (event: React.MouseEvent, tabId: string) => void;
  onOpenQuickPane?: (descriptor: PaneDescriptor) => void;
  position?: "top" | "bottom";
};

export const TabStrip = ({
  onOpenCommandPalette,
  onTabContextMenu,
  onOpenQuickPane,
  position = "top",
}: TabStripProps) => {
  const tabLabels = useAtomValue(tabLabelsAtom);
  const tabs = useAtomValue(tabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const { homeDirectory, alwaysShowTabs } = useAtomValue(userSettingsAtom);
  const [applicationMode, setApplicationMode] = useAtom(applicationModeAtom);
  const isDesignMode = applicationMode === "design";
  const isInFocusMode = applicationMode === "focus";
  const hasMultipleTabs = tabs.length > 1;

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

  const isInOverviewMode = applicationMode === "overview";

  const tabStripTransitionStyle = useMemo<React.CSSProperties>(() => {
    const collapsed = isInFocusMode || isInOverviewMode || !activeTabId;
    return {
      flexBasis: collapsed ? "0rem" : "2.7rem",
      minHeight: collapsed ? 0 : "2.7rem",
      opacity: collapsed ? 0 : 1,
      pointerEvents: collapsed ? "none" : "auto",
      willChange: "flex-basis, opacity",
    };
  }, [activeTabId, isInFocusMode, isInOverviewMode]);

  const [draggingTab, setDraggingTab] = useState<{
    id: string;
    width: number;
    originalIndex: number;
  } | null>(null);

  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const [isRepoDialogOpen, setIsRepoDialogOpen] = useState(false);

  // Track pane drag hover for tab switching
  const paneDragHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const paneDragHoverTabRef = useRef<string | null>(null);

  const clearPaneDragHoverTimeout = useCallback(() => {
    if (paneDragHoverTimeoutRef.current) {
      clearTimeout(paneDragHoverTimeoutRef.current);
      paneDragHoverTimeoutRef.current = null;
    }
    paneDragHoverTabRef.current = null;
  }, []);

  const clearPreviewCloseTimeout = useCallback(() => {
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current);
      previewCloseTimeoutRef.current = null;
    }
  }, []);

  const clearDragState = useCallback(() => {
    setDraggingTab(null);
    setDropTargetIndex(null);
    clearPaneDragHoverTimeout();
    clearPreviewCloseTimeout();
    setHoverPreview(null);
  }, [clearPaneDragHoverTimeout, clearPreviewCloseTimeout]);

  const isPaneDrag = useCallback((e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes("application/x-conduit-pane-drag");
  }, []);

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
  const { reorderableTabs, placeholderIndex, nonDraggingIndexById } =
    useMemo(() => {
      if (!draggingTab) {
        return {
          reorderableTabs: tabLabels,
          placeholderIndex: null,
          nonDraggingIndexById: {} as Record<string, number>,
        };
      }

      const reorderableTabs = tabLabels.filter(
        (tab) => tab.id !== draggingTab.id,
      );
      const nonDraggingIndexById = reorderableTabs.reduce<
        Record<string, number>
      >((acc, tab, index) => {
        acc[tab.id] = index;
        return acc;
      }, {});

      const baseIndex = Math.max(0, draggingTab.originalIndex);
      const fallbackIndex = Math.min(baseIndex, reorderableTabs.length);
      const clampedTarget = Math.max(
        0,
        Math.min(dropTargetIndex ?? fallbackIndex, reorderableTabs.length),
      );
      const placeholderIndex =
        clampedTarget === fallbackIndex ? null : clampedTarget;

      return {
        reorderableTabs,
        placeholderIndex,
        nonDraggingIndexById,
      };
    }, [tabLabels, dropTargetIndex, draggingTab]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, tabId: string) => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tabId);
      }

      const { width } = e.currentTarget.getBoundingClientRect();
      const originalIndex = tabLabels.findIndex((tab) => tab.id === tabId);

      setDraggingTab({
        id: tabId,
        width,
        originalIndex,
      });

      setDropTargetIndex(null);
      setHoverPreview(null);
    },
    [tabLabels],
  );

  const handlePreviewHoverChange = useCallback(
    (isHovering: boolean) => {
      if (isHovering) {
        // Mouse entered - cancel any pending close timeout
        clearPreviewCloseTimeout();
        setIsPreviewHovered(true);
      } else {
        // Mouse truly left (relatedTarget check passed) - close immediately
        setIsPreviewHovered(false);
        setHoverPreview(null);
      }
    },
    [clearPreviewCloseTimeout],
  );

  const handleTabHoverChange = useCallback(
    (tabId: string, element: HTMLButtonElement | null) => {
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
    },
    [
      activeTabId,
      draggingTab,
      isPreviewHovered,
      isDesignMode,
      clearPreviewCloseTimeout,
    ],
  );

  const handleDragOverTab = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, overTabId: string) => {
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

      // Handle tab drag (existing tab reordering logic)
      if (draggingTab.id === overTabId) {
        return;
      }

      applyMoveDropEffect(event);

      const rect = event.currentTarget.getBoundingClientRect();
      const isBefore = event.clientX < rect.left + rect.width / 2;
      const overIndex = reorderableTabs.findIndex(
        (tab) => tab.id === overTabId,
      );

      if (overIndex === -1) {
        return;
      }

      const nextIndex = isBefore ? overIndex : overIndex + 1;
      if (nextIndex !== dropTargetIndex) {
        setDropTargetIndex(nextIndex);
      }
    },
    [
      activeTabId,
      applyMoveDropEffect,
      clearPaneDragHoverTimeout,
      dropTargetIndex,
      draggingTab,
      isPaneDrag,
      reorderableTabs,
    ],
  );

  const handleDragLeaveTab = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, tabId: string) => {
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
    },
    [clearPaneDragHoverTimeout],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<Element>) => {
      e.preventDefault();

      if (
        dropTargetIndex !== null &&
        dropTargetIndex !== draggingTab.originalIndex
      ) {
        moveTab(draggingTab.id, dropTargetIndex);
      }

      clearDragState();
      clearPaneDragHoverTimeout();
    },
    [
      clearDragState,
      clearPaneDragHoverTimeout,
      draggingTab,
      dropTargetIndex,
      reorderableTabs.length,
    ],
  );

  const tabsWithPlaceholders = useMemo<React.ReactNode[]>(() => {
    const shouldShowPlaceholder =
      draggingTab !== null && placeholderIndex !== null;

    const shouldShowTrailingPlaceholder =
      shouldShowPlaceholder && placeholderIndex === reorderableTabs.length;

    const elements: React.ReactNode[] = [];

    tabLabels.forEach((tab, index) => {
      const nonDraggingIndex = nonDraggingIndexById[tab.id];
      const showLeadingPlaceholder =
        shouldShowPlaceholder &&
        nonDraggingIndex !== undefined &&
        nonDraggingIndex === placeholderIndex;

      if (showLeadingPlaceholder) {
        elements.push(
          <TabPlaceholder
            key={`placeholder-${tab.id}-${index}`}
            width={draggingTab?.width}
            onDragOver={applyMoveDropEffect}
            onDrop={handleDrop}
          />,
        );
      }

      // Render the tab if it's not being dragged, or if we aren't showing a placeholder
      if (tab.id !== draggingTab?.id || !shouldShowPlaceholder) {
        elements.push(
          <TabButton
            key={`tab-${tab.id}`}
            tabId={tab.id}
            label={tab.label}
            tooltip={tab.tooltip}
            title={tab.title}
            index={index}
            isActive={tab.isActive}
            disableClick={draggingTab !== null}
            isLocked={tab.locked}
            isSynchronized={tab.synchronized}
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
      elements.push(
        <TabPlaceholder
          key="placeholder-trailing"
          width={draggingTab?.width}
          onDragOver={applyMoveDropEffect}
          onDrop={handleDrop}
        />,
      );
    }

    return elements;
  }, [
    clearDragState,
    tabLabels,
    draggingTab,
    handleDragLeaveTab,
    handleDragOverTab,
    handleDragStart,
    handleDrop,
    handleTabHoverChange,
    nonDraggingIndexById,
    onTabContextMenu,
    placeholderIndex,
  ]);

  const handleOpenQuickTerminal = useCallback(async () => {
    const api = window.conduit;
    const cwd = getActiveTabCwd(activeTab, homeDirectory);
    const result = await api.createTerminal({ cwd });
    if (!result) return;
    onOpenQuickPane({
      type: "terminal",
      sessionId: result.sessionId,
      cwd: result.cwd ?? null,
    });
  }, [activeTab, homeDirectory, onOpenQuickPane]);

  const handleOpenQuickCloudTerminal = useCallback(() => {
    setIsRepoDialogOpen(true);
  }, []);

  const handleOpenQuickFileExplorer = useCallback(() => {
    const cwd = getActiveTabCwd(activeTab, homeDirectory);
    onOpenQuickPane({ type: "editor", cwd });
  }, [activeTab, homeDirectory, onOpenQuickPane]);

  const handleRepoSubmit = useCallback(
    async (repo?: { owner: string; name: string }) => {
      const api = window.conduit;

      const notificationId = enqueueNotification({
        kind: "info",
        message: "Creating cloud VM...",
        persistent: true,
      });

      try {
        const result = await api.createTerminal({
          isRemoteVM: true,
          githubRepo: repo,
        });

        if (!result || !onOpenQuickPane) {
          throw new Error("Failed to create VM terminal");
        }

        dismissNotification(notificationId);

        onOpenQuickPane({
          type: "terminal",
          sessionId: result.sessionId,
          cwd: result.cwd ?? null,
          vmMetadata: result.vmMetadata ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateNotification(notificationId, {
          kind: "error",
          message: "Failed to create cloud VM",
          details: message,
          autoCloseMs: null,
        });
      }
    },
    [onOpenQuickPane],
  );

  // Use margins to create gaps that reveal the overlay underneath
  const marginClass = alwaysShowTabs
    ? position === "top"
      ? "mb-[1px]"
      : "mt-[1px] rounded-b-xl"
    : "";

  return (
    <>
      <div
        className={`flex items-center gap-2 px-2 bg-elevated ${marginClass} w-full min-w-0 transition-all duration-300 ease-in-out overflow-hidden`}
        style={tabStripTransitionStyle}
      >
        {/* Tab buttons */}
        <div
          className="flex items-stretch align-middle content-center gap-1 flex-1 overflow-x-auto scrollbar-thin min-w-0"
          role="tablist"
          onDragOver={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }

            applyMoveDropEffect(event);
            setDropTargetIndex(reorderableTabs.length);
          }}
          onDrop={(e) => {
            if (e.target !== e.currentTarget) {
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
          {tabsWithPlaceholders}

          <Separator
            orientation="vertical"
            className="h-6 bg-elevated-border ml-2 mr-0.5 my-1"
          />

          {/* New tab button - after divider */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="border-0 text-inherit rounded-lg w-8 h-8 text-lg inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/15"
                aria-label="New tab"
                onClick={() => {
                  void openTab();
                }}
              >
                <PlusSquare size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New tab (⌘T)</TooltipContent>
          </Tooltip>

          {/* Overview button - only when multiple tabs */}
          {hasMultipleTabs && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-foreground/10"
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
                onClick={onOpenCommandPalette}
              >
                <MoreHorizontal size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Show command palette (⌘⇧P)
            </TooltipContent>
          </Tooltip>

          {/* Quick pane split button */}
          <div className="group flex items-stretch transition-colors duration-150 hover:bg-foreground/15 focus-within:bg-foreground/15 rounded-lg overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-6 h-8 inline-flex items-center justify-center transition-colors duration-150 hover:bg-foreground/10"
                  aria-label="Open local quick terminal"
                  onClick={handleOpenQuickTerminal}
                >
                  <SquareTerminal size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open quick terminal</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-4 h-8 inline-flex items-center justify-center transition-colors duration-150 hover:bg-foreground/10"
                  aria-label="More quick terminal options"
                >
                  <ChevronDown size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenQuickTerminal}>
                  <Terminal size={16} className="mr-3" />
                  Terminal (Local)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenQuickCloudTerminal}>
                  <Cloud size={16} className="mr-3" />
                  Terminal (Cloud)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenQuickFileExplorer}>
                  <FolderTree size={16} className="mr-3" />
                  File explorer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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
                disabled={!activeTab}
                draggable={!!activeTab}
                onDragStart={(e) => {
                  if (!activeTab) return;
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
        </div>
      </div>

      <TabPreviewOverlay
        preview={hoverPreview}
        onPreviewHoverChange={handlePreviewHoverChange}
      />

      <RepositoryDialog
        isOpen={isRepoDialogOpen}
        onClose={() => setIsRepoDialogOpen(false)}
        onSubmit={handleRepoSubmit}
      />
    </>
  );
};
