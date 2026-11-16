import { useSettings } from "@features/settings/client/queries";
import { Activity } from "react";
import { PaneControlButtons } from "@features/workbench/components/layout/design/PaneControlButtons";
import { FocusModeIndicator } from "@features/workbench/components/layout/focus/FocusModeIndicator";
import { CollapsedPaneBar } from "@features/workbench/components/layout/normal/CollapsedPaneBar";
import { IntersectionHandles } from "@features/workbench/components/layout/normal/IntersectionHandles";
import { PaneHighlight } from "@features/workbench/components/layout/normal/PaneHighlight";
import { ResizeHandle } from "@features/workbench/components/layout/normal/ResizeHandle";
import { useTabContentPortal } from "@features/workbench/components/layout/normal/TabContentPortalContext";
import { usePaneDragDrop } from "@features/workbench/components/layout/normal/usePaneDragDrop";
import { ErrorBoundary } from "@/ui/error-boundary";
import type { ContextMenuAction } from "@/commands/menus/types";
import { SandboxIndicator } from "@features/terminal/components/shell/sandbox/SandboxIndicator";
import { getLayoutPane } from "@features/workbench/components/layout/paneKinds";
import type {
  LayoutResizeAxis,
  LayoutResizeStartConfig,
} from "@features/workbench/components/layout/useLayoutResizing";
import {
  handleCompleteAgentSessionAction,
  handleDeleteAgentSessionAction,
} from "@features/agents/components/useSandboxHandlers";
import { enterFocusMode } from "@features/workbench/client/actions/focusMode";
import {
  activatePane,
  closePane,
  setPaneCollapsed,
} from "@features/workbench/client/actions/pane";
import { hasNeighborPane } from "@features/workbench/client/actions/paneNavigation";
import { focusTab } from "@features/workbench/client/actions/tab";
import {
  activePaneIdAtom,
  activeTabIdAtom,
  applicationModeAtom,
  tabsAtom,
} from "@features/workbench/client/atoms";
import type {
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  SplitDirection,
  Tab,
} from "@features/workbench/model";
import { cn } from "@/utils";
import {
  countPanesInLayout,
  layoutContainsPaneId,
} from "@features/workbench/client/layout";
import { getUnifiedSandboxForTab } from "@features/agents/client/sandbox";
import { shallow, useSelector } from "@tanstack/react-store";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const INTERSECTION_TOLERANCE = 0.08;

// Stable empty handlers for locked tabs to avoid creating new objects on each render
const LOCKED_DRAG_HANDLERS = { onDragStart: () => {}, onDragEnd: () => {} };
const LOCKED_DROP_HANDLERS = {
  onDragOver: () => {},
  onDragLeave: () => {},
  onDrop: () => {},
};

type BoundaryInfo = {
  leadingId: string;
  trailingId: string;
  leadingSize: number;
  trailingSize: number;
  position: number;
};

/**
 * Pre-computed tab context to avoid redundant calculations during render.
 * These values are computed once per tab and passed through the render tree.
 */
type TabRenderContext = {
  paneCount: number;
  isOnlyTab: boolean;
};

// Where a node sits in the split that contains it
type SplitPlacement = {
  direction: SplitDirection;
  isLastChild: boolean;
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

const COLLAPSED_PANE_SIZE = 25;

/**
 * Generate the CSS grid template styles for a split node,
 * taking into account collapsed panes and focus mode.
 */
function buildGridTemplateStyles(
  children: LayoutNode[],
  direction: SplitDirection,
  activePaneId?: string,
  isInFocusMode?: boolean,
): React.CSSProperties {
  const buildTemplateString = (values: (number | "collapsed")[]): string => {
    if (values.length === 0) return "minmax(0, 1fr)";
    return values
      .map((value) =>
        value === "collapsed"
          ? `${COLLAPSED_PANE_SIZE}px`
          : `minmax(0, ${Math.max(value, 0)}fr)`,
      )
      .join(" ");
  };

  // When in focus mode, only allocate space to the active pane
  // so we're only rendering one pane at a time, and hide all others.
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

  const hasCollapsedSibling = children.some(
    (c) => c.type === "pane" && c.collapsed,
  );

  const templateValue = buildTemplateString(
    children.map((child) => {
      if (child.type === "pane" && child.collapsed) return "collapsed";

      // If there are collapses siblings in this layout, there we need to
      // check if there are other expanded siblings. If not, then we need
      // to force this pane to take up all available space.
      if (hasCollapsedSibling) {
        const hasExpandedSibling = children.some(
          (c) => c.type === "pane" && c.id !== child.id && !c.collapsed,
        );

        return hasExpandedSibling ? (child.size ?? 1) : 1;
      }
      return child.size ?? 1;
    }),
  );

  return direction === "row"
    ? { gridTemplateColumns: templateValue }
    : { gridTemplateRows: templateValue };
}

// A tab's content renders through a portal into one host element, which
// stays in the tab's panel, or moves into a preview of the tab. So hiding,
// showing or previewing a tab never remounts its panes. Editors render
// elsewhere and only place their DOM in a pane, and the portal is also how
// React delivers their events to that pane, e.g. a click activating it.
// Only the content hides with the tab, so the panel stays attached.
function TabPanel({
  tabId,
  isActive,
  isVisible,
  tabContent,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  tabId: string;
  isActive: boolean;
  isVisible: boolean;
  tabContent: React.ReactNode;
}) {
  const { attachPanel } = useTabContentPortal();
  const [host] = useState(() => {
    const element = document.createElement("div");
    // Lays the content out as the panel's (or preview's) own child
    element.style.display = "contents";
    return element;
  });
  const ref = (panel: HTMLDivElement) => attachPanel(tabId, panel, host);

  // A hidden element keeps focus until the next tab's pane takes it a frame
  // later, so keys typed in between would go to this tab, e.g. to its shell
  useLayoutEffect(() => {
    if (!isActive && host.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [isActive, host]);

  return (
    <div {...props} aria-hidden={!isActive} ref={ref}>
      <Activity mode={isVisible ? "visible" : "hidden"}>
        {children}
        {createPortal(tabContent, host)}
      </Activity>
    </div>
  );
}

interface TabLayoutProps {
  handleContextMenu: (
    event: React.MouseEvent,
    tabId: string,
    paneId?: string,
    actions?: ContextMenuAction[],
  ) => void;
  handleResizeStart: (
    e: React.MouseEvent,
    payload: LayoutResizeStartConfig,
  ) => void;
  resizingNode: string | null;
  onOpenPaneActions?: () => void;
}

export function TabLayout({
  handleContextMenu,
  handleResizeStart,
  resizingNode,
  onOpenPaneActions,
}: TabLayoutProps) {
  const tabIds = useSelector(tabsAtom, (tabs) => tabs.map((tab) => tab.id), {
    compare: shallow,
  });
  const activeTabId = useSelector(activeTabIdAtom);
  const activePaneId = useSelector(activePaneIdAtom);

  const applicationMode = useSelector(applicationModeAtom);
  const setApplicationMode = applicationModeAtom.set;
  const isInDesignMode = applicationMode === "design";

  const dimInactivePanes = useSettings((s) => s.dimInactivePanes);

  const [hoveredAxisKeys, setHoveredAxisKeys] = useState<string[]>([]);
  const [hoveredPaneId, setHoveredPaneId] = useState<string | null>(null);
  const [hoveredPreviewPaneId, setHoveredPreviewPaneId] = useState<
    string | null
  >(null);

  const { isTabInPreview } = useTabContentPortal();

  const {
    draggedPaneId,
    tabEdgeDropZone,
    createDragHandlers,
    createDropHandlers,
    createTabContainerDropHandlers,
    renderDropZone,
  } = usePaneDragDrop({ onDropComplete: setHoveredPaneId });

  const previousResizingNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousResizingNodeRef.current !== null && resizingNode === null) {
      setHoveredAxisKeys([]);
    }
    previousResizingNodeRef.current = resizingNode;
  }, [resizingNode]);

  const setHoverKeys = (keys: string[]) => {
    if (resizingNode === null) {
      setHoveredAxisKeys(keys);
    }
  };

  const renderPaneNode = (
    node: LayoutPaneNode,
    tab: Tab,
    hasUnifiedSandbox: boolean,
    ctx: TabRenderContext,
    placement?: SplitPlacement,
  ): React.ReactNode => {
    const pane = tab.panes[node.paneId];
    if (!pane) {
      return null;
    }

    const isLocked = tab.locked;
    const isActivePane = tab.id === activeTabId && pane.id === activePaneId;
    const isInFocusMode = applicationMode === "focus";
    const isHiddenInFocusMode = isInFocusMode && !isActivePane;
    const isInPreview = isTabInPreview(tab.id);
    const isCollapsed = Boolean(node.collapsed);

    const onPaneContextMenu = (
      event: React.MouseEvent,
      actions?: ContextMenuAction[],
    ) => handleContextMenu(event, tab.id, pane.id, actions);

    const onPaneActivate = (event?: React.MouseEvent) => {
      // If clicking a pane in a non-active tab (e.g., from preview), switch to that tab first
      if (tab.id !== activeTabId) {
        focusTab(tab.id);
      }
      if (applicationMode === "overview") {
        setApplicationMode("normal");
      }
      activatePane(tab.id, pane.id);

      // If Command (Mac) or Ctrl (Windows/Linux) is held, enter focus mode on this pane
      if (event && (event.metaKey || event.ctrlKey)) {
        enterFocusMode(tab.id, pane.id);
      }
    };

    // If the pane is collapsed, then we need to render it as a
    // horizontal/vertical bar with an expand button. But if we're
    // in focus mode, then we render the pane normally (not collapsed).
    if (isCollapsed && placement && !isInFocusMode) {
      return (
        <div
          data-node-id={node.id}
          className={cn(
            "flex-1 min-h-0 min-w-0 overflow-hidden relative",
            isHiddenInFocusMode && "hidden",
          )}
          onContextMenu={onPaneContextMenu}
        >
          <CollapsedPaneBar
            pane={pane}
            splitDirection={placement.direction}
            isLastChild={placement.isLastChild}
            onExpand={() => setPaneCollapsed(tab.id, pane.id, false)}
          />
        </div>
      );
    }

    const onPaneHover = (isHovering: boolean) => {
      if (isInDesignMode) {
        setHoveredPaneId(isHovering ? pane.id : null);
      }
      if (isInPreview) {
        setHoveredPreviewPaneId(isHovering ? pane.id : null);
      }
    };

    const LayoutPane = getLayoutPane(pane.type);

    const dragHandlers = isLocked
      ? LOCKED_DRAG_HANDLERS
      : createDragHandlers(pane.id, tab.id);
    const dropHandlers = isLocked
      ? LOCKED_DROP_HANDLERS
      : createDropHandlers(pane.id, tab.id);

    // While in design mode, show the pane controls if the current pane meets any of:
    // 1. It's currently being dragged
    // 2. It's currently being hovered (not during a drag operation)
    // 3. It's the active pane (not during a drag operation)
    const shouldRenderControls =
      isInDesignMode &&
      !isLocked &&
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
          // Only track hover state in design mode (for showing pane controls)
          // to avoid unnecessary re-renders in normal mode
          if (isInDesignMode) {
            setHoveredPaneId(pane.id);
          }
          if (isInPreview) {
            setHoveredPreviewPaneId(pane.id);
          }
        }}
        onMouseLeave={() => {
          // Editor panes use the global container pattern where content is
          // rendered via React portal. This causes onMouseLeave to fire when
          // entering the editor (React sees it as leaving this tree). Instead,
          // editor panes manage hover state via their onHover callback.
          if (isInDesignMode && pane.type !== "editor") {
            setHoveredPaneId(null);
          }
          if (isInPreview) {
            setHoveredPreviewPaneId(null);
          }
        }}
      >
        <div className="flex w-full h-full min-h-0 min-w-0 overflow-hidden">
          <ErrorBoundary
            resetKey={pane.id}
            onClose={() => closePane(tab.id, pane.id)}
          >
            {LayoutPane && (
              <LayoutPane
                key={pane.id}
                pane={pane}
                tab={tab}
                isActive={isActivePane}
                isInPreview={isInPreview}
                isResizing={resizingNode !== null}
                hideIndividualSandboxIndicator={hasUnifiedSandbox}
                onActivate={onPaneActivate}
                onContextMenu={onPaneContextMenu}
                onHover={onPaneHover}
              />
            )}
          </ErrorBoundary>
        </div>

        {/* Design mode overlay - blocks pane interactions while allowing
              resize handles (which are rendered outside this container) and
              pane control buttons (which have higher z-index) to remain interactive */}
        {isInDesignMode && (
          <div className="pointer-events-auto absolute inset-0 z-[30] bg-accent/20 backdrop-blur-[0.5px]" />
        )}

        {/* Dim inactive panes overlay (only in normal mode) */}
        {dimInactivePanes && applicationMode === "normal" && (
          <div
            className={`pointer-events-none absolute inset-0 z-[5] bg-black/40 transition-opacity duration-150 ${
              isActivePane ? "opacity-0" : "opacity-100"
            }`}
          />
        )}

        {/* Pane highlight overlay - only render when appropriate */}
        {Object.keys(tab.panes).length > 1 &&
          !isInFocusMode &&
          !isInDesignMode &&
          resizingNode === null && <PaneHighlight paneId={pane.id} />}

        {/* Preview hover overlay - show blue highlight when hovering pane in preview */}
        {isInPreview && hoveredPreviewPaneId === pane.id && (
          <div className="pointer-events-none absolute inset-0 z-[30] bg-accent/30 backdrop-blur-[0.5px]" />
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
            isOnlyPane={ctx.paneCount === 1}
            isOnlyTab={ctx.isOnlyTab}
            onOpenPaneActions={onOpenPaneActions}
            {...dragHandlers}
          />
        )}
      </div>
    );
  };

  const renderSplitNode = (
    node: LayoutSplitNode,
    tab: Tab,
    renderChild: (
      node: LayoutNode,
      tab: Tab,
      hasUnifiedSandbox: boolean,
      ctx: TabRenderContext,
      placement: SplitPlacement,
    ) => React.ReactNode,
    hasUnifiedSandbox: boolean,
    ctx: TabRenderContext,
  ): React.ReactNode => {
    const isInFocusMode = applicationMode === "focus";
    const isLocked = tab.locked;

    // Generate the grid template for this split
    const gridTemplate = buildGridTemplateStyles(
      node.children,
      node.direction,
      tab.activePaneId,
      isInFocusMode,
    );

    // Use grid gap to create spaces that reveal the overlay underneath.
    // Hide gaps in focus mode and design mode. A preview keeps them, so its
    // panes are the size they are in the tab and don't resize as it shows.
    const gridGapClass =
      applicationMode === "focus" || applicationMode === "design"
        ? "gap-0"
        : "gap-[1px]";

    return (
      /* Render the split container (the grid which positions the child panes) */
      <div
        data-node-id={node.id}
        className={`grid flex-1 min-h-0 min-w-0 overflow-hidden ${gridGapClass}`}
        style={
          resizingNode === null
            ? { ...gridTemplate } // ...GRID_TEMPLATE_TRANSITION_STYLE } (Disabling this for now due to jank)
            : gridTemplate
        }
      >
        {node.children.map((child, index) => {
          const previousSibling = index !== 0 ? node.children[index - 1] : null;
          const isBeingResized = resizingNode === child.id;

          // In design mode, add dashed borders as visual indicators (overlaid on content)
          const splitBorderClass =
            index !== 0 && isInDesignMode
              ? `${node.direction === "row" ? "border-l" : "border-t"} border-accent border-dashed`
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
            ? "bg-accent/80"
            : "bg-transparent hover:bg-accent/80";

          // We only want to render resize handles between two pane nodes
          // when the previous sibling pane isn't collapsed, when the tab
          // isn't locked, and when we're not in focus mode.
          const shouldRenderHandles =
            previousSibling !== null &&
            !isInFocusMode &&
            !isLocked &&
            (previousSibling.type === "split" ||
              (previousSibling.type === "pane" && !previousSibling.collapsed));

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
                    className={isInDesignMode ? "z-[31]" : undefined}
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
                    className={isInDesignMode ? "z-[31]" : undefined}
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

              {renderChild(child, tab, hasUnifiedSandbox, ctx, {
                direction: node.direction,
                isLastChild: index === node.children.length - 1,
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Not a useCallback, because the React Compiler skips the whole component
  // for a recursive useCallback.
  const renderLayout = (
    node: LayoutNode,
    tab: Tab,
    hasUnifiedSandbox: boolean,
    ctx: TabRenderContext,
    placement?: SplitPlacement,
  ): React.ReactNode =>
    node.type === "pane"
      ? renderPaneNode(node, tab, hasUnifiedSandbox, ctx, placement)
      : renderSplitNode(node, tab, renderLayout, hasUnifiedSandbox, ctx);

  const isFocusModeActive = applicationMode === "focus";

  const renderTab = (tab: Tab): React.ReactNode => {
    const isActive = tab.id === activeTabId;

    // Check if all panes share the same sandbox context
    const unifiedSandbox = getUnifiedSandboxForTab(tab);
    const hasUnifiedSandbox = unifiedSandbox !== null;

    // Pre-compute values that would otherwise be calculated per-pane
    const ctx: TabRenderContext = {
      paneCount: countPanesInLayout(tab.layout),
      isOnlyTab: tabIds.length === 1,
    };

    const tabContent = renderLayout(tab.layout, tab, hasUnifiedSandbox, ctx);

    // Get drop handlers for root-level splits (only for active, unlocked tabs)
    const tabDropHandlers =
      isActive && !tab.locked
        ? createTabContainerDropHandlers(tab.id)
        : undefined;

    // Determine if we should show the tab edge drop zone overlay
    const showTabEdgeOverlay =
      isActive && isInDesignMode && draggedPaneId && tabEdgeDropZone;

    return (
      <TabPanel
        key={tab.id}
        tabId={tab.id}
        isActive={isActive}
        isVisible={isActive || isTabInPreview(tab.id)}
        tabContent={tabContent}
        role="tabpanel"
        className={
          isActive
            ? "flex-1 flex min-h-0 min-w-0 overflow-hidden relative"
            : "flex-1 hidden min-h-0 min-w-0 overflow-hidden relative"
        }
        onDragOver={tabDropHandlers?.onDragOver}
        onDragLeave={tabDropHandlers?.onDragLeave}
        onDrop={tabDropHandlers?.onDrop}
      >
        {/* Tab edge drop zone overlay for root-level splits */}
        {showTabEdgeOverlay && (
          <div
            className="pointer-events-none absolute z-[35] bg-accent/40"
            style={{
              top: tabEdgeDropZone === "bottom" ? "auto" : 0,
              bottom: tabEdgeDropZone === "top" ? "auto" : 0,
              left: tabEdgeDropZone === "right" ? "auto" : 0,
              right: tabEdgeDropZone === "left" ? "auto" : 0,
              width:
                tabEdgeDropZone === "left" || tabEdgeDropZone === "right"
                  ? "80px"
                  : "100%",
              height:
                tabEdgeDropZone === "top" || tabEdgeDropZone === "bottom"
                  ? "80px"
                  : "100%",
            }}
          />
        )}
        {unifiedSandbox && (
          <SandboxIndicator
            agentSessionId={unifiedSandbox.agentSessionId}
            onCompleteAgentSession={() =>
              handleCompleteAgentSessionAction(
                tab.id,
                unifiedSandbox.agentSessionId,
              )
            }
            onDeleteAgentSession={() =>
              handleDeleteAgentSessionAction(
                tab.id,
                unifiedSandbox.agentSessionId,
              )
            }
          />
        )}
      </TabPanel>
    );
  };

  return (
    <div className="flex-1 flex relative min-h-0 overflow-hidden">
      {tabIds.map((tabId) => (
        <TabSlot key={tabId} tabId={tabId} renderTab={renderTab} />
      ))}

      {isFocusModeActive && <FocusModeIndicator />}

      {/* Centered "Preparing..." message when there are no tabs */}
      {tabIds.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center justify-center bg-elevated p-4 rounded-md border border-elevated-border text-sm">
            Preparing terminal...
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renders one tab from its own subscription, so a change inside a tab, like a
 * terminal retitling itself, re-renders only that tab.
 */
function TabSlot({
  tabId,
  renderTab,
}: {
  tabId: string;
  renderTab: (tab: Tab) => React.ReactNode;
}) {
  const tab = useSelector(tabsAtom, (tabs) =>
    tabs.find((candidate) => candidate.id === tabId),
  );
  return tab ? renderTab(tab) : null;
}
