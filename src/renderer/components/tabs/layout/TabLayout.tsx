import { EditorPane } from "@/components/panes/editor/EditorPane";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import { usePaneHighlight } from "@/components/panes/usePaneHighlight";
import { WebPane } from "@/components/panes/web/WebPane";
import type { PaneDescriptor } from "@/components/shell/QuickDialog";
import { PaneControlButtons } from "@/components/tabs/design/PaneControlButtons";
import { FocusModeIndicator } from "@/components/tabs/layout/FocusModeIndicator";
import { IntersectionHandles } from "@/components/tabs/layout/IntersectionHandles";
import { ResizeHandle } from "@/components/tabs/layout/ResizeHandle";
import type {
  LayoutResizeAxis,
  LayoutResizeStartConfig,
} from "@/hooks/useLayoutResizing";
import { usePaneDragDrop } from "@/hooks/usePaneDragDrop";
import {
  exitFocusMode,
  getAllPaneIds,
  navigateFocusedPane,
} from "@/store/actions/focusMode";
import { activatePane, openWebViewPane } from "@/store/actions/pane";
import { hasNeighborPane } from "@/store/actions/paneNavigation";
import {
  activePaneIdAtom,
  activeTabAtom,
  applicationModeAtom,
  tabsAtom,
} from "@/store/atoms";
import type {
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  SplitDirection,
  Tab,
} from "@/types";
import { countPanesInLayout, findPaneNodeByPaneId } from "@/utils/layout";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useRef, useState } from "react";

const INTERSECTION_TOLERANCE = 0.08;

const shouldShowPaneBorder = (tab: Tab): boolean => {
  return Object.keys(tab.panes).length > 1 && tab.mode !== "focus";
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
  parentDirection: SplitDirection
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
        Math.abs(seed.position - boundary.position) <= INTERSECTION_TOLERANCE
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
  direction: SplitDirection
): React.CSSProperties {
  const childCount = children.length || 1;
  const hasSizes = children.some((child) => child.size !== undefined);

  if (!hasSizes) {
    return direction === "row"
      ? { gridTemplateColumns: `repeat(${childCount}, minmax(0, 1fr))` }
      : { gridTemplateRows: `repeat(${childCount}, minmax(0, 1fr))` };
  }

  const templateValue = children
    .map((child) => (child.size !== undefined ? `${child.size}fr` : "1fr"))
    .join(" ");

  return direction === "row"
    ? { gridTemplateColumns: templateValue }
    : { gridTemplateRows: templateValue };
}

interface TabLayoutProps {
  handleContextMenu: (
    event: React.MouseEvent,
    tabId: string,
    paneId?: string
  ) => void;
  handleResizeStart: (
    e: React.MouseEvent,
    payload: LayoutResizeStartConfig
  ) => void;
  resizingNode: string | null;
  handleWebViewUpdate: (
    tabId: string,
    paneId: string,
    updates: { url?: string; title?: string }
  ) => void;
  handleEditorUpdate: (
    tabId: string,
    paneId: string,
    updates: {
      cwd?: string;
      filePath?: string;
    }
  ) => void;
  onOpenQuickPane?: (descriptor: PaneDescriptor) => void;
}

export function TabLayout({
  handleContextMenu,
  handleResizeStart,
  resizingNode,
  handleWebViewUpdate,
  handleEditorUpdate,
  onOpenQuickPane,
}: TabLayoutProps) {
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const activePaneId = useAtomValue(activePaneIdAtom);
  const activeTabId = activeTab?.id ?? null;
  const applicationMode = useAtomValue(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";
  const shouldShowTerminalDimensions = applicationMode === "normal";

  const [hoveredAxisKeys, setHoveredAxisKeys] = useState<string[]>([]);
  const [hoveredPaneId, setHoveredPaneId] = useState<string | null>(null);

  const { triggerHighlight, getHighlightClass } = usePaneHighlight();

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

  const highlightPane = useCallback(
    (tab: Tab | undefined, paneId: string | null | undefined) => {
      if (!tab || !paneId) {
        return;
      }

      if (isInDesignMode || resizingNode !== null) {
        return;
      }

      if (!shouldShowPaneBorder(tab)) {
        return;
      }

      triggerHighlight(paneId);
    },
    [isInDesignMode, resizingNode, triggerHighlight]
  );

  useEffect(() => {
    if (!activeTab || !activePaneId) {
      return;
    }

    highlightPane(activeTab, activePaneId);
  }, [activeTab, activePaneId]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (!activeTab || !activePaneId) {
        return;
      }

      highlightPane(activeTab, activePaneId);
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [activeTab, activePaneId]);

  const setHoverKeys = useCallback(
    (keys: string[]) => {
      if (resizingNode === null) {
        setHoveredAxisKeys(keys);
      }
    },
    [resizingNode, setHoveredAxisKeys]
  );

  const renderPaneNode = useCallback(
    (node: LayoutPaneNode, tab: Tab): React.ReactNode => {
      const pane = tab.panes[node.paneId];
      if (!pane) {
        return null;
      }

      const isActivePane = tab.id === activeTabId && pane.id === activePaneId;

      // Calculate pane number (1-based index)
      const allPaneIds = getAllPaneIds(tab);
      const paneNumber = allPaneIds.indexOf(pane.id) + 1;

      const onPaneContextMenu = (event: React.MouseEvent) =>
        handleContextMenu(event, tab.id, pane.id);
      const onPaneActivate = () => activatePane(tab.id, pane.id);

      const onWebViewContextMenu = (coords: {
        clientX: number;
        clientY: number;
      }) => {
        const syntheticEvent = {
          preventDefault: () => { },
          stopPropagation: () => { },
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
          }}
          {...dropHandlers}
          onMouseEnter={() => setHoveredPaneId(pane.id)}
          onMouseLeave={() => setHoveredPaneId(null)}
        >
          <div className="flex w-full h-full min-h-0 min-w-0 overflow-hidden">
            {pane.type === "terminal" ? (
              <TerminalPane
                key={pane.sessionId}
                sessionId={pane.sessionId}
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
                <WebPane
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
                />
              </div>
            )}
          </div>

          {isInDesignMode && (
            <div className="pointer-events-none absolute inset-0 z-10 bg-blueprint/20 backdrop-blur-[0.5px]" />
          )}

          {/* Drop zone overlay */}
          {renderDropZone(pane.id)}

          {shouldRenderControls && (
            <PaneControlButtons
              tabId={tab.id}
              paneId={pane.id}
              paneNumber={paneNumber}
              canMoveLeft={hasNeighborPane(tab.layout, pane.id, "left")}
              canMoveRight={hasNeighborPane(tab.layout, pane.id, "right")}
              canMoveUp={hasNeighborPane(tab.layout, pane.id, "up")}
              canMoveDown={hasNeighborPane(tab.layout, pane.id, "down")}
              isOnlyPane={countPanesInLayout(tab.layout) === 1}
              isOnlyTab={tabs.length === 1}
              isInFocusMode={tab.mode === "focus"}
              {...dragHandlers}
            />
          )}
        </div>
      );
    },
    [
      activePaneId,
      activeTabId,
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
    ]
  );

  const renderSplitNode = useCallback(
    (
      node: LayoutSplitNode,
      tab: Tab,
      renderChild: (node: LayoutNode, tab: Tab) => React.ReactNode
    ): React.ReactNode => {
      // Generate the grid template for this split
      const gridTemplate = buildGridTemplateStyles(
        node.children,
        node.direction
      );

      const tabShowsBorder = shouldShowPaneBorder(tab);

      return (
        /* Render the split container (the grid which positions the child panes) */
        <div
          data-node-id={node.id}
          className="grid flex-1 min-h-0 min-w-0 gap-0 overflow-hidden"
          style={gridTemplate}
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
            const splitBorderClass =
              index !== 0 ? `${borderSideClass} ${borderColorClass}` : "";

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

            const highlightClass =
              !isInDesignMode && child.type === "pane" && tabShowsBorder
                ? getHighlightClass(child.paneId)
                : "";

            const intersectionHandles = primaryAxis
              ? computeIntersectionHandles(
                previousSibling,
                child,
                node.direction
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
                className={`flex w-full h-full min-h-0 min-w-0 overflow-hidden relative ${highlightClass} ${splitBorderClass}`}
              >
                {primaryAxis && (
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
      getHighlightClass,
      handleResizeStart,
      hoveredAxisKeys,
      isInDesignMode,
      resizingNode,
      setHoverKeys,
    ]
  );

  const renderLayout = useCallback(
    (node: LayoutNode, tab: Tab) => {
      if (node.type === "pane") {
        return renderPaneNode(node, tab);
      }
      return renderSplitNode(node, tab, renderLayout);
    },
    [renderPaneNode, renderSplitNode]
  );

  const renderFocusMode = useCallback(
    (tab: Tab) => {
      const paneNode = findPaneNodeByPaneId(tab.layout, tab.activePaneId);

      const paneIds = getAllPaneIds(tab);
      const currentIndex = paneIds.indexOf(tab.activePaneId);

      return (
        <>
          {renderPaneNode(paneNode, tab)}
          <FocusModeIndicator
            onExit={() => exitFocusMode(tab.id)}
            onPrevious={() => navigateFocusedPane(tab.id, "prev")}
            onNext={() => navigateFocusedPane(tab.id, "next")}
            currentPaneIndex={currentIndex}
            totalPanes={paneIds.length}
          />
        </>
      );
    },
    [renderPaneNode]
  );

  const renderTab = useCallback(
    (tab: Tab): React.ReactNode => {
      const isActive = tab.id === activeTabId;
      return (
        <div
          key={tab.id}
          role="tabpanel"
          aria-hidden={!isActive}
          className={
            isActive
              ? "flex-1 flex min-h-0 min-w-0 overflow-hidden"
              : "flex-1 hidden min-h-0 min-w-0 overflow-hidden"
          }
        >
          {tab.mode === "focus"
            ? renderFocusMode(tab)
            : renderLayout(tab.layout, tab)}
        </div>
      );
    },
    [activeTabId, renderFocusMode, renderLayout]
  );

  return (
    <div className="flex-1 flex relative min-h-0 overflow-hidden">
      {tabs.map(renderTab)}
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
