import type { PaneDescriptor } from "@/components/shell/QuickDialog";
import { TabButton, TabPlaceholder } from "@/components/shell/TabButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApplicationCommands } from "@/commands/applicationCommands";
import { useCommand, getCommandDisplayTitle } from "@/commands/hooks/useCommand";
import { enterFocusMode } from "@/store/actions/focusMode";
import { dismissNotification, enqueueNotification, updateNotification } from "@/store/actions/notifications";
import { moveTab, openTab } from "@/store/actions/tab";
import {
  activeTabAtom,
  activeTabIdAtom,
  applicationModeAtom,
  tabsAtom,
  userSettingsAtom,
} from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import { useAtom, useAtomValue } from "jotai";
import {
  Cloud,
  Expand,
  FileEdit,
  Globe,
  MoreHorizontal,
  PlusSquare,
  SquareDashedMousePointer,
  Terminal,
  Zap,
  Grid3x3,
  GitBranch,
  Code,
  Bot,
  HelpCircle,
  Container,
  Database,
  Package,
  Server,
  TestTube,
  Bug,
  Rocket,
  Shield,
  Book,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useEnabledPaneActions } from "@/paneActions";

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

// Icon mapping for pane actions
const ICON_MAP: Record<string, LucideIcon> = {
  'git-branch': GitBranch,
  'code': Code,
  'terminal': Terminal,
  'globe': Globe,
  'bot': Bot,
  'container': Container,
  'database': Database,
  'package': Package,
  'server': Server,
  'test-tube': TestTube,
  'bug': Bug,
  'rocket': Rocket,
  'shield': Shield,
  'book': Book,
  'wrench': Wrench,
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
  const activeTab = useAtomValue(activeTabAtom);
  const { homeDirectory, alwaysShowTabs } = useAtomValue(userSettingsAtom);
  const [applicationMode, setApplicationMode] = useAtom(applicationModeAtom);
  const isDesignMode = applicationMode === "design";
  const isInFocusMode = applicationMode === "focus";

  // Pane actions for testing
  const paneActions = useEnabledPaneActions();

  // Command hooks for button actions
  const toggleFocusModeCmd = useCommand(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE);
  const toggleDesignModeCmd = useCommand(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE);

  const tabStripTransitionStyle = useMemo<React.CSSProperties>(() => {
    const collapsed = isInFocusMode;
    return {
      flexBasis: collapsed ? "0rem" : "2.7rem",
      minHeight: collapsed ? 0 : "2.7rem",
      opacity: collapsed ? 0 : 1,
      pointerEvents: collapsed ? "none" : "auto",
      willChange: "flex-basis, opacity",
    };
  }, [isInFocusMode]);

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
    (pathValue: string | null | undefined) => {
      if (!pathValue) {
        return null;
      }

      if (!homeDirectory) {
        return pathValue;
      }

      const normalizedPath = pathValue.replace(/\\/g, "/");
      const normalizedHome = homeDirectory.replace(/\\/g, "/");

      if (normalizedPath === normalizedHome) {
        return "~";
      }

      const homeWithSlash = normalizedHome.endsWith("/")
        ? normalizedHome
        : `${normalizedHome}/`;

      if (normalizedPath.startsWith(homeWithSlash)) {
        const suffix = normalizedPath.slice(homeWithSlash.length);
        return suffix ? `~/${suffix}` : "~";
      }

      return pathValue;
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
        } else if (activePane?.type === "editor") {
          const editorPath = activePane.filePath ?? activePane.cwd ?? null;
          if (editorPath) {
            fallbackLabel = formatPathForLabel(editorPath) ?? editorPath;
            tooltipBase = editorPath;
          } else {
            fallbackLabel = "Editor";
            tooltipBase = fallbackLabel;
          }
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

  const handleOpenQuickCloudTerminal = useCallback(async () => {
    const api = window.conduit;

    const notificationId = enqueueNotification({
      kind: "info",
      message: "Creating cloud VM...",
      persistent: true,
    });

    try {
      const result = await api.createTerminal({
        isRemoteVM: true,
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
  }, [onOpenQuickPane]);

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

  const handlePaneAction = useCallback(async (action: any) => {
    if (!onOpenQuickPane) {
      return;
    }

    if (action.paneType === 'terminal') {
      // Create actual terminal session
      const api = window.conduit;
      const result = await api.createTerminal({
        cwd: action.config?.cwd || homeDirectory || undefined,
      });

      if (!result) {
        return;
      }

      onOpenQuickPane({
        type: "terminal",
        sessionId: result.sessionId,
        cwd: result.cwd ?? null,
        processTitle: "",
      } as PaneDescriptor);

      // If there's a command, send it after a short delay
      const command = action.config?.command;
      if (command) {
        setTimeout(() => {
          api.sendKeypress(result.sessionId, command + '\n');
        }, 100);
      }
    } else if (action.paneType === 'editor') {
      const editorConfig = action.config as any;
      onOpenQuickPane({
        type: "editor",
        cwd: editorConfig?.folderPath || homeDirectory || homeDirectory,
      } as PaneDescriptor);
    } else if (action.paneType === 'browser') {
      onOpenQuickPane({
        type: "webview",
        url: action.config?.url || "https://www.google.com",
      } as PaneDescriptor);
    }
  }, [onOpenQuickPane, homeDirectory]);

  const borderClass = alwaysShowTabs ? (position === "top" ? "border-b" : "border-t rounded-b-xl") : "";

  return (
    <div
      className={`flex items-center gap-2 px-2 bg-surface-muted ${borderClass} border-border w-full min-w-0 transition-all duration-300 ease-in-out overflow-hidden`}
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

        {/* Pane Actions dropdown button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="border-0 bg-transparent text-white/70 rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/10 hover:text-white"
              title="Pane Actions"
              aria-label="Pane Actions"
            >
              <Grid3x3 size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-40">
            {paneActions.map((action, index) => {
              const IconComponent = ICON_MAP[action.icon] || HelpCircle;
              return (
                <DropdownMenuItem key={index} onClick={() => handlePaneAction(action)}>
                  <IconComponent size={16} className="mr-3" />
                  {action.name}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

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
          <DropdownMenuContent align="end" className="max-w-40">
            <DropdownMenuItem onClick={handleOpenQuickTerminal}>
              <Terminal size={16} className="mr-3" />
              Terminal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenQuickCloudTerminal}>
              <Cloud size={16} className="mr-3" />
              Terminal (Cloud)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenQuickEditor}>
              <FileEdit size={16} className="mr-3" />
              Editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenQuickWeb}>
              <Globe size={16} className="mr-3" />
              Web
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Expand button for focus mode */}
        <button
          type="button"
          className="border-0 bg-transparent text-white/70 rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title={getCommandDisplayTitle(toggleFocusModeCmd)}
          aria-label={toggleFocusModeCmd.title}
          onClick={toggleFocusModeCmd.execute}
          disabled={!activeTab}
          draggable={!!activeTab}
          onDragStart={(e) => {
            if (!activeTab) return;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-conduit-focus-mode", "true");
          }}
        >
          <Expand size={18} />
        </button>

        <button
          type="button"
          className={`border-0 rounded-lg w-8 h-8 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 ${isDesignMode
            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            : "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          title={getCommandDisplayTitle(toggleDesignModeCmd)}
          aria-label={toggleDesignModeCmd.title}
          onClick={toggleDesignModeCmd.execute}
        >
          <SquareDashedMousePointer size={18} />
        </button>
      </div>
    </div>
  );
};
