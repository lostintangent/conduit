import { PaneControlButtons } from "@/components/layout/design/PaneControlButtons";
import { FocusModeIndicator } from "@/components/layout/focus/FocusModeIndicator";
import { IntersectionHandles } from "@/components/layout/normal/IntersectionHandles";
import {
  PaneHighlight,
  shouldShowPaneBorder,
} from "@/components/layout/normal/PaneHighlight";
import { ResizeHandle } from "@/components/layout/normal/ResizeHandle";
import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { usePaneDragDrop } from "@/components/layout/normal/usePaneDragDrop";
import { BrowserPane } from "@/components/panes/browser/BrowserPane";
import { EditorPane } from "@/components/panes/editor/EditorPane";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import type { PaneDescriptor } from "@/components/shell/QuickDialog";
import type {
  LayoutResizeAxis,
  LayoutResizeStartConfig,
} from "@/hooks/useLayoutResizing";
import {
  enterFocusMode,
  exitFocusMode,
  getAllPaneIds,
  navigateFocusedPane,
} from "@/store/actions/focusMode";
import { activatePane, openWebViewPane } from "@/store/actions/pane";
import { hasNeighborPane } from "@/store/actions/paneNavigation";
import { focusTab } from "@/store/actions/tab";
import {
  activePaneIdAtom,
  activeTabIdAtom,
  applicationModeAtom,
  tabsAtom,
} from "@/store/atoms";
import type { ApplicationMode } from "@/store/atoms";
import type {
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  SplitDirection,
  Tab,
} from "@/types";
import { countPanesInLayout, layoutContainsPaneId } from "@/utils/layout";
import { calculatePreviewDimensions, PREVIEW_SCALE } from "@/utils/preview-scaling";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const INTERSECTION_TOLERANCE = 0.08;

const GRID_TEMPLATE_TRANSITION_STYLE: React.CSSProperties = {
  transition: "grid-template-columns 160ms ease, grid-template-rows 160ms ease",
};

type BoundaryInfo = {
  leadingId: string;
  trailingId: string;
  leadingSize: number;
  trailingSize: number;
  position: number;
};

type IntersectionHandleConfig = {
  key: string;
  position: number;
  direction: SplitDirection;
  axes: LayoutResizeAxis[];
  axisKeys: string[];
};

const getAxisKey = (axis: LayoutResizeAxis) =>
  `${axis.containerNodeId}:${axis.direction}:${axis.leadingNodeId}:${axis.trailingNodeId}`;

const collectBoundaries = (node: LayoutNode): BoundaryInfo[] => {
  if (node.type !== "split" || node.children.length < 2) {
    return [];
  }

  const sizes = node.children.map((child) => child.size ?? 1);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  let cumulative = 0;

  return node.children.slice(0, -1).map((child, index) => {
    const currentSize = sizes[index];
    cumulative += currentSize;
    const nextNode = node.children[index + 1];
    const nextSize = sizes[index + 1];
    const position =
      total > 0 ? cumulative / total : (index + 1) / node.children.length;

    return {
      leadingId: child.id,
      trailingId: nextNode.id,
      leadingSize: currentSize,
      trailingSize: nextSize,
      position,
    };
  });
};

const computeIntersectionHandles = (
  previousSibling: LayoutNode,
  currChild: LayoutNode,
  parentDirection: SplitDirection,
): IntersectionHandleConfig[] => {
  const perpendicularDirection: SplitDirection =
    parentDirection === "row" ? "column" : "row";

  const prevBoundaries =
    previousSibling.type === "split" &&
    previousSibling.direction === perpendicularDirection
      ? collectBoundaries(previousSibling)
      : [];

  const currBoundaries =
    currChild.type === "split" && currChild.direction === perpendicularDirection
      ? collectBoundaries(currChild)
      : [];

  if (prevBoundaries.length === 0 && currBoundaries.length === 0) {
    return [];
  }

  type IntersectionSeed = {
    position: number;
    axes: LayoutResizeAxis[];
    axisKeys: string[];
  };

  const seeds: IntersectionSeed[] = [];

  const mergeSeed = (boundary: BoundaryInfo, splitId: string) => {
    const existing = seeds.find(
      (seed) =>
        Math.abs(seed.position - boundary.position) <= INTERSECTION_TOLERANCE,
    );

    const axis: LayoutResizeAxis = {
      containerNodeId: splitId,
      direction: perpendicularDirection,
      leadingNodeId: boundary.leadingId,
      trailingNodeId: boundary.trailingId,
      leadingSize: boundary.leadingSize,
      trailingSize: boundary.trailingSize,
    };
    const key = getAxisKey(axis);

    if (existing) {
      existing.position = (existing.position + boundary.position) / 2;
      if (!existing.axisKeys.includes(key)) {
        existing.axes.push(axis);
        existing.axisKeys.push(key);
      }
      return;
    }

    seeds.push({
      position: boundary.position,
      axes: [axis],
      axisKeys: [key],
    });
  };

  prevBoundaries.forEach((boundary) => mergeSeed(boundary, previousSibling.id));
  currBoundaries.forEach((boundary) => mergeSeed(boundary, currChild.id));

  return seeds.map((seed, index) => ({
    key: `${previousSibling.id}-${currChild.id}-${index}`,
    position: seed.position,
    direction: perpendicularDirection,
    axes: seed.axes,
    axisKeys: seed.axisKeys,
  }));
};

function buildGridTemplateStyles(
  children: LayoutNode[],
  direction: SplitDirection,
  activePaneId?: string,
  isInFocusMode?: boolean,
): React.CSSProperties {
  const buildTemplateString = (values: number[]): string => {
    if (values.length === 0) {
      return "minmax(0, 1fr)";
    }

    return values
      .map((value) => `minmax(0, ${Math.max(value, 0)}fr)`)
      .join(" ");
  };

  // In focus mode, make non-active panes 0fr so the active pane fills the space
  if (isInFocusMode && activePaneId) {
    const templateValue = buildTemplateString(
      children.map((child) =>
        layoutContainsPaneId(child, activePaneId) ? 1 : 0,
      ),
    );

    return direction === "row"
      ? { gridTemplateColumns: templateValue }
      : { gridTemplateRows: templateValue };
  }

  const templateValue = buildTemplateString(
    children.map((child) => child.size ?? 1),
  );

  return direction === "row"
    ? { gridTemplateColumns: templateValue }
    : { gridTemplateRows: templateValue };
}

interface TabLayoutProps {
  handleContextMenu: (
    event: React.MouseEvent,
    tabId: string,
    paneId?: string,
  ) => void;
  handleResizeStart: (
    e: React.MouseEvent,
    payload: LayoutResizeStartConfig,
  ) => void;
  resizingNode: string | null;
  handleWebViewUpdate: (
    tabId: string,
    paneId: string,
    updates: { url?: string; title?: string },
  ) => void;
  handleEditorUpdate: (
    tabId: string,
    paneId: string,
    updates: {
      cwd?: string;
      filePath?: string;
    },
  ) => void;
  onOpenQuickPane?: (descriptor: PaneDescriptor) => void;
  onOpenPaneActions?: () => void;
}

export function TabLayout({
  handleContextMenu,
  handleResizeStart,
  resizingNode,
  handleWebViewUpdate,
  handleEditorUpdate,
  onOpenQuickPane,
  onOpenPaneActions,
}: TabLayoutProps) {
  const tabs = useAtomValue(tabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const activePaneId = useAtomValue(activePaneIdAtom);
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";
  const shouldShowTerminalDimensions = applicationMode === "normal";
  const previewDimensions = useMemo(
    () => calculatePreviewDimensions(PREVIEW_SCALE),
    [],
  );
  const previousModeRef = useRef<ApplicationMode>("normal");

  useEffect(() => {
    if (applicationMode !== "overview") {
      previousModeRef.current = applicationMode;
    }
  }, [applicationMode]);

  useEffect(() => {
    if (applicationMode === "overview" && activeTabId) {
      const timeout = window.setTimeout(() => {
        setApplicationMode(previousModeRef.current ?? "normal");
      }, 220);

      return () => {
        window.clearTimeout(timeout);
      };
    }
  }, [applicationMode, activeTabId, setApplicationMode]);

  const [hoveredAxisKeys, setHoveredAxisKeys] = useState<string[]>([]);
  const [hoveredPaneId, setHoveredPaneId] = useState<string | null>(null);
  const [hoveredPreviewPaneId, setHoveredPreviewPaneId] = useState<
    string | null
  >(null);

  const { setLayoutMountPoint, getActiveMountPoint, isTabInPreview } =
    useTabContentPortal();

  // In order to mount/unmound the tab content portals, we need a stable ref
  // callback for each tab container. So this is simply a map of tab IDs to ref callbacks.
  const tabContainerCallbackRefs = useRef<
    Record<string, (node: HTMLDivElement | null) => void>
  >({});

  const {
    draggedPaneId,
    dragHoverPaneId,
    createDragHandlers,
    createDropHandlers,
    renderDropZone,
  } = usePaneDragDrop({ onDropComplete: setHoveredPaneId });

  const previousResizingNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousResizingNodeRef.current !== null && resizingNode === null) {
      setHoveredAxisKeys([]);
    }
    previousResizingNodeRef.current = resizingNode;
  }, [resizingNode]);

  const setHoverKeys = useCallback(
    (keys: string[]) => {
      if (resizingNode === null) {
        setHoveredAxisKeys(keys);
      }
    },
    [resizingNode, setHoveredAxisKeys],
  );

  const renderPaneNode = useCallback(
    (node: LayoutPaneNode, tab: Tab): React.ReactNode => {
      const pane = tab.panes[node.paneId];
      if (!pane) {
        return null;
      }

      const isActivePane = tab.id === activeTabId && pane.id === activePaneId;
      const isInFocusMode = applicationMode === "focus";
      const isHiddenInFocusMode = isInFocusMode && !isActivePane;
      const isInPreview = isTabInPreview(tab.id);

      const onPaneContextMenu = (event: React.MouseEvent) =>
        handleContextMenu(event, tab.id, pane.id);
      const onPaneActivate = (event?: React.MouseEvent) => {
        // If clicking a pane in a non-active tab (e.g., from preview), switch to that tab first
        if (tab.id !== activeTabId) {
          focusTab(tab.id);
        }
        activatePane(tab.id, pane.id);

        // If Command (Mac) or Ctrl (Windows/Linux) is held, enter focus mode on this pane
        if (event && (event.metaKey || event.ctrlKey)) {
          enterFocusMode(tab.id, pane.id);
        }
      };

      const onWebViewContextMenu = (coords: {
        clientX: number;
        clientY: number;
      }) => {
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: coords.clientX,
          clientY: coords.clientY,
        } as React.MouseEvent;
        handleContextMenu(syntheticEvent, tab.id, pane.id);
      };

      const dragHandlers = createDragHandlers(pane.id, tab.id);
      const dropHandlers = createDropHandlers(pane.id, tab.id);

      // While in design mode, show the pane controls if the current pane meets any of:
      // 1. It's currently being dragged
      // 2. It's currently being hovered (not during a drag operation)
      // 3. It's the active pane (not during a drag operation)
      const shouldRenderControls =
        isInDesignMode &&
        (draggedPaneId === pane.id ||
          (!draggedPaneId && hoveredPaneId === pane.id) ||
          (!draggedPaneId && !hoveredPaneId && isActivePane));

      return (
        <div
          data-node-id={node.id}
          className="grid flex-1 min-h-0 min-w-0 overflow-hidden relative"
          style={{
            gridTemplateColumns: "minmax(0, 1fr)",
            gridTemplateRows: "minmax(0, 1fr)",
            display: isHiddenInFocusMode ? "none" : undefined,
          }}
          {...dropHandlers}
          onMouseEnter={() => {
            setHoveredPaneId(pane.id);
            if (isInPreview) {
              setHoveredPreviewPaneId(pane.id);
            }
          }}
          onMouseLeave={() => {
            setHoveredPaneId(null);
            if (isInPreview) {
              setHoveredPreviewPaneId(null);
            }
          }}
        >
          <div className="flex w-full h-full min-h-0 min-w-0 overflow-hidden">
            {pane.type === "terminal" ? (
              <TerminalPane
                key={pane.sessionId}
                terminalId={pane.sessionId}
                paneId={pane.id}
                isActive={isActivePane}
                onActivate={onPaneActivate}
                onContextMenu={onPaneContextMenu}
                onLinkClick={(url) => openWebViewPane(tab.id, pane.id, url)}
                showDimensions={shouldShowTerminalDimensions}
              />
            ) : pane.type === "editor" ? (
              <div
                className="flex flex-1 w-full h-full min-h-0 min-w-0"
                onContextMenu={onPaneContextMenu}
                onMouseDown={onPaneActivate}
              >
                <EditorPane
                  key={pane.id}
                  cwd={pane.cwd}
                  filePath={pane.filePath}
                  onFileChange={(fileData) =>
                    handleEditorUpdate(tab.id, pane.id, {
                      filePath: fileData.filePath,
                    })
                  }
                  onClearFile={() =>
                    handleEditorUpdate(tab.id, pane.id, {
                      filePath: undefined,
                    })
                  }
                  onCwdChange={(cwd) =>
                    handleEditorUpdate(tab.id, pane.id, { cwd })
                  }
                  onFileOpen={(node) =>
                    onOpenQuickPane({
                      type: "editor",
                      cwd: pane?.cwd,
                      filePath: node.path,
                    })
                  }
                />
              </div>
            ) : (
              <div
                className="flex flex-1 w-full h-full min-h-0 min-w-0"
                onContextMenu={onPaneContextMenu}
                onMouseDown={onPaneActivate}
              >
                <BrowserPane
                  key={pane.id}
                  url={pane.url}
                  paneId={pane.id}
                  disableInteraction={resizingNode !== null}
                  onContextMenu={onWebViewContextMenu}
                  onUrlChange={(nextUrl) =>
                    handleWebViewUpdate(tab.id, pane.id, { url: nextUrl })
                  }
                  onTitleChange={(nextTitle) =>
                    handleWebViewUpdate(tab.id, pane.id, { title: nextTitle })
                  }
                  isInPreview={isInPreview}
                  onHover={(isHovering) => {
                    setHoveredPaneId(isHovering ? pane.id : null);
                    if (isInPreview) {
                      setHoveredPreviewPaneId(isHovering ? pane.id : null);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {isInDesignMode && (
            <div className="pointer-events-none absolute inset-0 z-10 bg-blueprint/20 backdrop-blur-[0.5px]" />
          )}

          {/* Pane highlight overlay */}
          <PaneHighlight paneId={pane.id} isResizing={resizingNode !== null} />

          {/* Preview hover overlay - show blue highlight when hovering pane in preview */}
          {isInPreview && hoveredPreviewPaneId === pane.id && (
            <div className="pointer-events-none absolute inset-0 z-20 bg-blueprint/30 backdrop-blur-[0.5px]" />
          )}

          {/* Drop zone overlay */}
          {renderDropZone(pane.id)}

          {shouldRenderControls && (
            <PaneControlButtons
              tabId={tab.id}
              paneId={pane.id}
              canMoveLeft={hasNeighborPane(tab.layout, pane.id, "left")}
              canMoveRight={hasNeighborPane(tab.layout, pane.id, "right")}
              canMoveUp={hasNeighborPane(tab.layout, pane.id, "up")}
              canMoveDown={hasNeighborPane(tab.layout, pane.id, "down")}
              isOnlyPane={countPanesInLayout(tab.layout) === 1}
              isOnlyTab={tabs.length === 1}
              onOpenPaneActions={onOpenPaneActions}
              {...dragHandlers}
            />
          )}
        </div>
      );
    },
    [
      activePaneId,
      activeTabId,
      applicationMode,
      createDragHandlers,
      createDropHandlers,
      handleContextMenu,
      handleEditorUpdate,
      handleWebViewUpdate,
      isInDesignMode,
      onOpenQuickPane,
      renderDropZone,
      shouldShowTerminalDimensions,
      resizingNode,
      setHoveredPaneId,
      tabs,
      draggedPaneId,
      dragHoverPaneId,
      hoveredPaneId,
      isTabInPreview,
      hoveredPreviewPaneId,
      setHoveredPreviewPaneId,
    ],
  );

  const renderSplitNode = useCallback(
    (
      node: LayoutSplitNode,
      tab: Tab,
      renderChild: (node: LayoutNode, tab: Tab) => React.ReactNode,
    ): React.ReactNode => {
      const isInFocusMode = applicationMode === "focus";

      // Generate the grid template for this split
      const gridTemplate = buildGridTemplateStyles(
        node.children,
        node.direction,
        tab.activePaneId,
        isInFocusMode,
      );

      const tabShowsBorder = shouldShowPaneBorder(tab, applicationMode);

      return (
        /* Render the split container (the grid which positions the child panes) */
        <div
          data-node-id={node.id}
          className="grid flex-1 min-h-0 min-w-0 gap-0 overflow-hidden"
          style={
            resizingNode === null
              ? { ...gridTemplate } // ...GRID_TEMPLATE_TRANSITION_STYLE } (Disabling this for now due to jank)
              : gridTemplate
          }
        >
          {node.children.map((child, index) => {
            const previousSibling =
              index !== 0 ? node.children[index - 1] : null;
            const isBeingResized = resizingNode === child.id;

            const borderSideClass =
              node.direction === "row" ? "border-l" : "border-t";
            const borderColorClass = isInDesignMode
              ? "border-blueprint border-dashed"
              : "border-white/[0.12]";
            // Don't show borders in focus mode
            const splitBorderClass =
              index !== 0 && !isInFocusMode
                ? `${borderSideClass} ${borderColorClass}`
                : "";

            const primaryAxis: LayoutResizeAxis | null = previousSibling
              ? {
                  containerNodeId: node.id,
                  direction: node.direction,
                  leadingNodeId: previousSibling.id,
                  trailingNodeId: child.id,
                  leadingSize: previousSibling.size ?? 1,
                  trailingSize: child.size ?? 1,
                }
              : null;

            const primaryAxisKey = primaryAxis ? getAxisKey(primaryAxis) : null;
            const baseHighlightKeys =
              primaryAxisKey !== null ? [primaryAxisKey] : [];
            const isAxisHighlighted =
              isBeingResized ||
              (primaryAxisKey !== null &&
                hoveredAxisKeys.includes(primaryAxisKey));

            const highlightDividerClass = isAxisHighlighted
              ? "bg-blue-500/60"
              : "bg-transparent hover:bg-blue-500/40";

            const shouldRenderHandles = primaryAxis !== null && !isInFocusMode;

            const intersectionHandles =
              shouldRenderHandles && primaryAxis
                ? computeIntersectionHandles(
                    previousSibling,
                    child,
                    node.direction,
                  )
                : [];

            const clearHover = () => {
              if (!isBeingResized) {
                setHoverKeys([]);
              }
            };

            return (
              // Render the pane with optional dividers/handles
              <div
                key={child.id}
                className={`flex w-full h-full min-h-0 min-w-0 overflow-hidden relative ${splitBorderClass}`}
              >
                {shouldRenderHandles && primaryAxis && (
                  <>
                    <ResizeHandle
                      direction={node.direction}
                      highlightClass={highlightDividerClass}
                      onMouseDown={(e) => {
                        setHoverKeys(baseHighlightKeys);
                        handleResizeStart(e, {
                          tabId: tab.id,
                          activeHandleId: child.id,
                          axes: [primaryAxis],
                        });
                      }}
                      onMouseLeave={clearHover}
                    />
                    <IntersectionHandles
                      direction={node.direction}
                      handles={intersectionHandles}
                      baseHighlightKeys={baseHighlightKeys}
                      onHandleMouseDown={(e, handle, highlightKeys) => {
                        setHoverKeys(highlightKeys);
                        handleResizeStart(e, {
                          tabId: tab.id,
                          activeHandleId: child.id,
                          axes: [primaryAxis, ...handle.axes],
                        });
                      }}
                      onHandleMouseEnter={(_, highlightKeys) => {
                        setHoverKeys(highlightKeys);
                      }}
                      onHandleMouseLeave={clearHover}
                    />
                  </>
                )}
                {renderChild(child, tab)}
              </div>
            );
          })}
        </div>
      );
    },
    [
      applicationMode,
      handleResizeStart,
      hoveredAxisKeys,
      isInDesignMode,
      resizingNode,
      setHoverKeys,
    ],
  );

  const renderLayout = useCallback(
    (node: LayoutNode, tab: Tab) => {
      if (node.type === "pane") {
        return renderPaneNode(node, tab);
      }
      return renderSplitNode(node, tab, renderLayout);
    },
    [renderPaneNode, renderSplitNode],
  );

  const renderTab = useCallback(
    (tab: Tab, index: number): React.ReactNode => {
      const isActive = tab.id === activeTabId;
      const isInFocusMode = applicationMode === "focus";
      const isOverviewMode = applicationMode === "overview";
      const hasOverviewSelection = isOverviewMode && Boolean(activeTabId);

      if (!tabContainerCallbackRefs.current[tab.id]) {
        tabContainerCallbackRefs.current[tab.id] = (
          node: HTMLDivElement | null,
        ) => setLayoutMountPoint(tab.id, node);
      }

      const tabContainerRef = tabContainerCallbackRefs.current[tab.id];
      const portalTarget = getActiveMountPoint(tab.id);

      const tabContent = (
        <>
          {renderLayout(tab.layout, tab)}
          {isInFocusMode &&
            isActive &&
            (() => {
              const paneIds = getAllPaneIds(tab);
              const currentIndex = paneIds.indexOf(tab.activePaneId);

              return (
                <FocusModeIndicator
                  onExit={() => exitFocusMode()}
                  onPrevious={() => navigateFocusedPane("prev")}
                  onNext={() => navigateFocusedPane("next")}
                  currentPaneIndex={currentIndex}
                  totalPanes={paneIds.length}
                  layout={tab.layout}
                  activePaneId={tab.activePaneId}
                  onSelectPane={(paneId) => activatePane(tab.id, paneId)}
                />
              );
            })()}
        </>
      );

      const isOverviewActive = hasOverviewSelection && isActive;
      const previewLabel = tab.title?.trim() || `Tab ${index + 1}`;

      const containerStyle: React.CSSProperties = (() => {
        if (isOverviewMode) {
          if (hasOverviewSelection) {
            return {
              flexGrow: isOverviewActive ? 1 : 0,
              flexBasis: isOverviewActive ? "100%" : "0%",
              transition: "flex-grow 220ms ease, flex-basis 220ms ease",
            };
          }

          return {
            flexGrow: 0,
            flexBasis: `${previewDimensions.displayWidth}px`,
            maxWidth: `${previewDimensions.displayWidth}px`,
            width: `${previewDimensions.displayWidth}px`,
          };
        }

        return {
          flexGrow: isActive ? 1 : 0,
          flexBasis: isActive ? "100%" : "0%",
          transition: "flex-grow 220ms ease, flex-basis 220ms ease",
        };
      })();

      const cardStyle: React.CSSProperties = (() => {
        if (isOverviewMode) {
          return {
            width: isOverviewActive
              ? "100%"
              : `${previewDimensions.displayWidth}px`,
            height: isOverviewActive
              ? "100%"
              : `${previewDimensions.displayHeight}px`,
            transition: "width 220ms ease, height 220ms ease",
          };
        }

        return {
          width: "100%",
          height: "100%",
        };
      })();

      const contentStyle: React.CSSProperties = {
        transform:
          isOverviewMode && !isOverviewActive
            ? `scale(${PREVIEW_SCALE})`
            : "none",
        transformOrigin: "top left",
        width:
          isOverviewMode && !isOverviewActive
            ? `${previewDimensions.contentWidth}px`
            : "100%",
        height:
          isOverviewMode && !isOverviewActive
            ? `${previewDimensions.contentHeight}px`
            : "100%",
        transition: isOverviewMode ? "transform 200ms ease" : undefined,
        pointerEvents:
          !isOverviewMode || isOverviewActive ? "auto" : "none",
      };

      const wrapperClassName = `flex ${
        isOverviewMode
          ? "flex-col items-center gap-2"
          : "flex-1 min-h-0 min-w-0 overflow-hidden relative"
      } ${!hasOverviewSelection && isOverviewMode ? "cursor-pointer" : ""}`;

      const cardClassName = isOverviewMode
        ? `flex overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03] min-h-0 min-w-0 relative ${
            isOverviewActive ? "flex-1 w-full h-full" : ""
          } ${
            hasOverviewSelection
              ? ""
              : "hover:border-blueprint transition-colors duration-150"
          }`
        : "flex flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden relative";

      return (
        <div
          key={tab.id}
          className={wrapperClassName}
          style={containerStyle}
          onClick={
            isOverviewMode && !hasOverviewSelection
              ? () => {
                  focusTab(tab.id);
                }
              : undefined
          }
        >
          <div className={cardClassName} style={cardStyle}>
            <div
              ref={tabContainerRef}
              role="tabpanel"
              aria-hidden={!isOverviewMode && !isActive}
              className="flex w-full h-full min-h-0 min-w-0 overflow-hidden"
              style={contentStyle}
            />
            {portalTarget ? createPortal(tabContent, portalTarget) : null}
          </div>
          {isOverviewMode && !hasOverviewSelection && (
            <div className="text-sm text-muted-foreground px-1 truncate max-w-[320px]">
              {previewLabel}
            </div>
          )}
        </div>
      );
    },
    [
      activeTabId,
      applicationMode,
      getActiveMountPoint,
      previewDimensions,
      renderLayout,
      setLayoutMountPoint,
    ],
  );

  const isOverviewMode = applicationMode === "overview";
  const containerClassName = isOverviewMode
    ? "flex-1 flex flex-wrap content-start items-start justify-center gap-6 p-6 min-h-0 overflow-auto relative"
    : "flex-1 flex relative min-h-0 overflow-hidden";

  return (
    <div className={containerClassName}>
      {tabs.map((tab, index) => renderTab(tab, index))}
      {tabs.length === 0 && (
        <div className="flex-1 flex min-h-0 min-w-0" aria-live="polite">
          <div className="flex-1 flex items-center justify-center text-[0.95rem] text-white/60 bg-white/[0.03] border border-dashed border-white/[0.08] rounded-lg m-2">
            <span>Preparing terminal…</span>
          </div>
        </div>
      )}
    </div>
  );
}
