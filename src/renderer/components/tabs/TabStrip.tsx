import { moveTab, openTab } from "@/store/actions/tab";
import {
  activeTabIdAtom,
  isInDesignModeAtom,
  tabsAtom,
  userSettingsAtom,
} from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import { useAtom, useAtomValue } from "jotai";
import {
  Zap,
  MoreHorizontal,
  PlusSquare,
  SquareDashedMousePointer,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { TabButton, TabPlaceholder } from "./TabButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PaneDescriptor } from "@/components/shell/QuickPaneDialog";

type TabDescriptor = {
  id: string;
  label: string;
  tooltip: string;
  isActive: boolean;
  title: string | undefined;
};

type TabStripProps = {
  onOpenCommandPalette?: () => void;
  onTabContextMenu?: (event: React.MouseEvent, tabId: string) => void;
  onOpenQuickPane?: (descriptor: PaneDescriptor) => void;
  position?: "top" | "bottom";
};

const resolveActivePane = (tab: Tab): Pane | undefined => {
  const activePane = tab.panes[tab.activePaneId];
  if (activePane) {
    return activePane;
  }

  const firstPane = Object.values(tab.panes)[0];
  return firstPane;
};

export const TabStrip = ({
  onOpenCommandPalette,
  onTabContextMenu,
  onOpenQuickPane,
  position = "top",
}: TabStripProps) => {
  const tabs = useAtomValue(tabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const { homeDirectory } = useAtomValue(userSettingsAtom);
  const [isInDesignMode, setIsInDesignMode] = useAtom(isInDesignModeAtom);

  const [draggingTab, setDraggingTab] = useState<{
    id: string;
    width: number;
    originalIndex: number;
  } | null>(null);

  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const clearDragState = () => {
    setDraggingTab(null);
    setDropTargetIndex(null);
  };

  const applyMoveDropEffect = (e: React.DragEvent<Element>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const formatPathForLabel = useCallback(
    (cwd: string | null) => {
      if (!cwd) {
        return null;
      }

      if (homeDirectory && cwd === homeDirectory) {
        return "~";
      }

      if (homeDirectory && cwd.startsWith(homeDirectory)) {
        const suffix = cwd.slice(homeDirectory.length);
        return suffix ? `~${suffix}` : "~";
      }

      return cwd;
    },
    [homeDirectory]
  );

  const descriptors = useMemo<TabDescriptor[]>(
    () =>
      tabs.map((tab) => {
        const activePane = resolveActivePane(tab);
        let fallbackLabel = "Shell";
        let tooltipBase = "Shell";

        if (activePane?.type === "terminal") {
          fallbackLabel =
            formatPathForLabel(activePane.cwd) ??
            activePane.processTitle ??
            "Shell";

          tooltipBase =
            activePane.cwd ?? activePane.processTitle ?? fallbackLabel;
        } else if (activePane?.type === "webview") {
          const title = activePane.title?.trim();
          fallbackLabel = title && title.length > 0 ? title : activePane.url;
          tooltipBase = fallbackLabel;
        }

        const label = tab.title?.trim() ? tab.title.trim() : fallbackLabel;
        const tooltip = tab.title?.trim() ?? tooltipBase;

        return {
          id: tab.id,
          label,
          tooltip,
          isActive: tab.id === activeTabId,
          title: tab.title?.trim() || undefined,
        };
      }),
    [activeTabId, tabs]
  );

  // TODO: See if we can remove this code in favor of mergining it with the descriptors and tabs w/placeholders memos
  const { reorderableTabs, placeholderIndex, nonDraggingIndexById } = useMemo(() => {
    if (!draggingTab) {
      return {
        reorderableTabs: descriptors,
        placeholderIndex: null,
        nonDraggingIndexById: {} as Record<string, number>,
      };
    }

    const reorderableTabs = descriptors.filter(
      (tab) => tab.id !== draggingTab.id
    );
    const nonDraggingIndexById = reorderableTabs.reduce<Record<string, number>>(
      (acc, tab, index) => {
        acc[tab.id] = index;
        return acc;
      },
      {}
    );

    const baseIndex = Math.max(0, draggingTab.originalIndex);
    const fallbackIndex = Math.min(baseIndex, reorderableTabs.length);
    const clampedTarget = Math.max(
      0,
      Math.min(dropTargetIndex ?? fallbackIndex, reorderableTabs.length)
    );
    const placeholderIndex =
      clampedTarget === fallbackIndex ? null : clampedTarget;

    return {
      reorderableTabs,
      placeholderIndex,
      nonDraggingIndexById,
    };
  }, [descriptors, dropTargetIndex, draggingTab]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, tabId: string) => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tabId);
      }

      const { width } = e.currentTarget.getBoundingClientRect();
      const originalIndex = descriptors.findIndex((tab) => tab.id === tabId);

      setDraggingTab({
        id: tabId,
        width,
        originalIndex,
      });

      setDropTargetIndex(null);
    },
    [descriptors]
  );

  const handleDragOverTab = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, overTabId: string) => {
      if (draggingTab.id === overTabId) {
        return;
      }

      applyMoveDropEffect(event);

      const rect = event.currentTarget.getBoundingClientRect();
      const isBefore = event.clientX < rect.left + rect.width / 2;
      const overIndex = reorderableTabs.findIndex(
        (tab) => tab.id === overTabId
      );

      if (overIndex === -1) {
        return;
      }

      const nextIndex = isBefore ? overIndex : overIndex + 1;
      if (nextIndex !== dropTargetIndex) {
        setDropTargetIndex(nextIndex);
      }
    },
    [applyMoveDropEffect, dropTargetIndex, draggingTab, reorderableTabs]
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
    },
    [clearDragState, draggingTab, dropTargetIndex, reorderableTabs.length]
  );

  const tabsWithPlaceholders = useMemo<React.ReactNode[]>(() => {
    const shouldShowPlaceholder =
      draggingTab !== null && placeholderIndex !== null;

    const shouldShowTrailingPlaceholder =
      shouldShowPlaceholder && placeholderIndex === reorderableTabs.length;

    const elements: React.ReactNode[] = [];

    descriptors.forEach((tab, index) => {
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
          />
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
            onContextMenu={onTabContextMenu}
            onDragStart={handleDragStart}
            onDragOver={handleDragOverTab}
            onDrop={handleDrop}
            onDragEnd={clearDragState}
          />
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
        />
      );
    }

    return elements;
  }, [
    descriptors,
    draggingTab,
    handleDragOverTab,
    handleDragStart,
    handleDrop,
    nonDraggingIndexById,
    onTabContextMenu,
    placeholderIndex,
  ]);

  const handleOpenQuickTerminal = useCallback(async () => {
    const api = window.conduit;
    const result = await api.createTerminal(
      homeDirectory ? { cwd: homeDirectory } : undefined
    );
    if (!result || !onOpenQuickPane) {
      return;
    }
    onOpenQuickPane({
      type: "terminal",
      sessionId: result.sessionId,
      cwd: result.cwd ?? null,
    });
  }, [homeDirectory, onOpenQuickPane]);

  const handleOpenQuickEditor = useCallback(() => {
    if (!homeDirectory || !onOpenQuickPane) {
      return;
    }
    onOpenQuickPane({
      type: "editor",
      cwd: homeDirectory,
    });
  }, [homeDirectory, onOpenQuickPane]);

  const handleOpenQuickWeb = useCallback(() => {
    if (!onOpenQuickPane) {
      return;
    }
    onOpenQuickPane({
      type: "webview",
      url: "https://www.google.com",
    });
  }, [onOpenQuickPane]);

  const borderClass = position === "top" ? "border-b" : "border-t rounded-b-xl";

  return (
    <div
      className={`flex items-center gap-2 px-2 bg-surface-muted ${borderClass} border-border min-h-10 w-full min-w-0`}
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

        {/* Vertical divider */}
        <div className="h-6 my-1 w-px bg-white/20 ml-2 mr-0.5" />

        {/* New tab button - after divider */}
        <button
          type="button"
          className="border-0 text-inherit rounded-lg w-8 h-8 text-lg inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/15"
          title="New tab (⌘T)"
          aria-label="New tab"
          onClick={() => {
            void openTab();
          }}
        >
          <PlusSquare size={18} />
        </button>
      </div>


      {/* Action buttons - far right */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          className="border-0 bg-transparent text-white/70 rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/10 hover:text-white"
          title="Show command palette (⌘⇧P)"
          aria-label="Show command palette"
          onClick={onOpenCommandPalette}
        >
          <MoreHorizontal size={18} />
        </button>

        {/* Quick pane dropdown button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="border-0 bg-transparent text-white/70 rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/10 hover:text-white"
              title="Quick pane"
              aria-label="Quick pane"
            >
              <Zap size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleOpenQuickTerminal}>
              Terminal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenQuickEditor}>
              Editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenQuickWeb}>
              Web
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className={`border-0 rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 ${isInDesignMode
            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            : "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          title="Toggle pane controls (Alt+Space)"
          aria-label="Toggle pane controls"
          onClick={() => setIsInDesignMode((current) => !current)}
        >
          <SquareDashedMousePointer size={18} />
        </button>
      </div>
    </div>
  );
};
