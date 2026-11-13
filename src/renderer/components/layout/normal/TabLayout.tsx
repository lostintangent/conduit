import { Activity } from "react";
import { PaneControlButtons } from "@/components/layout/design/PaneControlButtons";
import { FocusModeIndicator } from "@/components/layout/focus/FocusModeIndicator";
import { IntersectionHandles } from "@/components/layout/normal/IntersectionHandles";
import { PaneHighlight } from "@/components/layout/normal/PaneHighlight";
import { ResizeHandle } from "@/components/layout/normal/ResizeHandle";
import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { usePaneDragDrop } from "@/components/layout/normal/usePaneDragDrop";
import type { PaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import { BrowserPane } from "@/components/panes/browser/BrowserPane";
import { CanvasPane } from "@/components/panes/canvas/CanvasPane";
import { EditorPaneAnchor } from "@/components/panes/editor";
import { SandboxIndicator } from "@/components/panes/terminal/shell/sandbox/SandboxIndicator";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import type {
  LayoutResizeAxis,
  LayoutResizeStartConfig,
} from "@/hooks/useLayoutResizing";
import {
  handleCompleteAgentSessionAction,
  handleDeleteAgentSessionAction,
} from "@/hooks/useSandboxHandlers";
import { enterFocusMode } from "@/store/actions/focusMode";
import {
  activatePane,
  closePane,
  openBrowserPane,
  setPaneCollapsed,
  updatePaneProperty,
} from "@/store/actions/pane";
import { hasNeighborPane } from "@/store/actions/paneNavigation";
import { focusTab } from "@/store/actions/tab";
import {
  activePaneIdAtom,
  activeTabAtom,
  applicationModeAtom,
  tabsAtom,
  userSettingsAtom,
} from "@/store/atoms";
import { sidebarStateAtom } from "@/store/sidebarStore";
import type {
  EditorPane as EditorPaneType,
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  SplitDirection,
  Tab,
} from "@/types";
import { cn } from "@/utils";
import { countPanesInLayout, layoutContainsPaneId } from "@/utils/layout";
import { getUnifiedSandboxForTab } from "@/utils/sandbox";
import { useAtomValue, useSetAtom } from "jotai";
import { UnfoldHorizontal, UnfoldVertical } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  devToolsTargets: Set<string>;
  isOnlyTab: boolean;
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
  handleBrowserUpdate: (
    tabId: string,
    paneId: string,
    updates: { url?: string; title?: string },
  ) => void;
  handleEditorUpdate: (
    tabId: string,
    paneId: string,
    updates: Partial<EditorPaneType>,
  ) => void;
  onOpenQuickPane?: (descriptor: PaneDescriptor) => void;
  onOpenPaneActions?: () => void;
}

export function TabLayout({
  handleContextMenu,
  handleResizeStart,
  resizingNode,
  handleBrowserUpdate,
  handleEditorUpdate,
  onOpenQuickPane,
  onOpenPaneActions,
}: TabLayoutProps) {
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const activePaneId = useAtomValue(activePaneIdAtom);
  const activeTabId = activeTab?.id ?? null;

  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";

  const { dimInactivePanes, terminalLinkTarget } =
    useAtomValue(userSettingsAtom);

  // Sidebar state for terminal link clicks
  const setSidebarState = useSetAtom(sidebarStateAtom);

  const [hoveredAxisKeys, setHoveredAxisKeys] = useState<string[]>([]);
  const [hoveredPaneId, setHoveredPaneId] = useState<string | null>(null);
  const [hoveredPreviewPaneId, setHoveredPreviewPaneId] = useState<
    string | null
  >(null);

  const { setLayoutMountPoint, getActiveMountPoint, isTabInPreview } =
    useTabContentPortal();

  const shouldShowTerminalDimensions = applicationMode === "normal";

  // In order to mount/unmound the tab content portals, we need a stable ref
  // callback for each tab container. So this is simply a map of tab IDs to ref callbacks.
  const tabContainerCallbackRefs = useRef<
    Record<string, (node: HTMLDivElement | null) => void>
  >({});

  const {
    draggedPaneId,
    dragHoverPaneId,
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

  const setHoverKeys = useCallback(
    (keys: string[]) => {
      if (resizingNode === null) {
        setHoveredAxisKeys(keys);
      }
    },
    [resizingNode, setHoveredAxisKeys],
  );

  const renderPaneNode = useCallback(
    (
      node: LayoutPaneNode,
      tab: Tab,
      hasUnifiedSandbox: boolean,
      ctx: TabRenderContext,
      parentDirection?: SplitDirection,
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

      const onPaneContextMenu = (event: React.MouseEvent) =>
        handleContextMenu(event, tab.id, pane.id);

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
      if (isCollapsed && !isInFocusMode) {
        const isHorizontalBar = parentDirection === "column";
        return (
          <div
            data-node-id={node.id}
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-hidden relative",
              isHiddenInFocusMode && "hidden",
            )}
            onContextMenu={onPaneContextMenu}
          >
            <button
              className="flex items-center w-full h-full justify-center bg-elevated hover:bg-elevated/80 transition-colors"
              onClick={() => setPaneCollapsed(tab.id, pane.id, false)}
            >
              {isHorizontalBar ? (
                <UnfoldVertical className="w-4 h-4" />
              ) : (
                <UnfoldHorizontal className="w-4 h-4" />
              )}
            </button>
          </div>
        );
      }

      const onBrowserContextMenu = (coords: {
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
            {pane.type === "terminal" ? (
              <TerminalPane
                key={pane.id}
                pane={pane}
                tabId={tab.id}
                isActive={isActivePane}
                onActivate={onPaneActivate}
                onContextMenu={onPaneContextMenu}
                // Resolve cloned terminal's sessionId here to avoid TerminalPane subscribing to all tabs
                resolvedSessionId={
                  pane.cloneOf
                    ? ((tab.panes[pane.cloneOf] as typeof pane)?.sessionId ??
                      pane.sessionId)
                    : pane.sessionId
                }
                onLinkClick={(url) => {
                  if (terminalLinkTarget === "sidebar") {
                    setSidebarState({
                      isOpen: true,
                      view: "browser",
                      navigation: { cwd: pane.cwd, browserUrl: url },
                    });
                  } else if (terminalLinkTarget === "default") {
                    window.api.openExternal(url);
                  } else {
                    openBrowserPane(tab.id, pane.id, url);
                  }
                }}
                showDimensions={shouldShowTerminalDimensions && !isInPreview}
                hideIndividualSandboxIndicator={hasUnifiedSandbox}
                isTabSynchronized={tab.synchronized}
              />
            ) : pane.type === "editor" ? (
              <div
                className="flex flex-1 w-full h-full min-h-0 min-w-0"
                onContextMenu={onPaneContextMenu}
                onMouseDown={onPaneActivate}
              >
                <EditorPaneAnchor
                  key={pane.id}
                  paneId={pane.id}
                  pane={pane}
                  onFileChange={(fileData) =>
                    handleEditorUpdate(tab.id, pane.id, {
                      file: fileData.file,
                    })
                  }
                  onClearFile={() =>
                    handleEditorUpdate(tab.id, pane.id, {
                      file: undefined,
                    })
                  }
                  onCwdChange={(cwd) =>
                    handleEditorUpdate(tab.id, pane.id, { cwd })
                  }
                  onTreeModeChange={(mode) =>
                    handleEditorUpdate(tab.id, pane.id, { treeMode: mode })
                  }
                  onChangesViewModeChange={(mode) =>
                    handleEditorUpdate(tab.id, pane.id, {
                      changesViewMode: mode,
                    })
                  }
                  onFileOpen={(node) =>
                    onOpenQuickPane({
                      type: "editor",
                      cwd: pane?.cwd,
                      file: node.path,
                    })
                  }
                  onHover={(isHovering) => {
                    if (isInDesignMode) {
                      setHoveredPaneId(isHovering ? pane.id : null);
                    }
                    if (isInPreview) {
                      setHoveredPreviewPaneId(isHovering ? pane.id : null);
                    }
                  }}
                  isInPreview={isInPreview}
                  onClose={() => closePane(tab.id, pane.id)}
                  className="h-full w-full"
                />
              </div>
            ) : pane.type === "browser" ? (
              <div
                className="flex flex-1 w-full h-full min-h-0 min-w-0"
                onContextMenu={onPaneContextMenu}
                onMouseDown={onPaneActivate}
              >
                <BrowserPane
                  key={pane.id}
                  url={pane.url}
                  paneId={pane.id}
                  tabId={tab.id}
                  disableInteraction={resizingNode !== null}
                  onContextMenu={onBrowserContextMenu}
                  onUrlChange={(nextUrl) =>
                    handleBrowserUpdate(tab.id, pane.id, { url: nextUrl })
                  }
                  onTitleChange={(nextTitle) =>
                    handleBrowserUpdate(tab.id, pane.id, { title: nextTitle })
                  }
                  isInPreview={isInPreview}
                  onHover={(isHovering) => {
                    if (isInDesignMode) {
                      setHoveredPaneId(isHovering ? pane.id : null);
                    }
                    if (isInPreview) {
                      setHoveredPreviewPaneId(isHovering ? pane.id : null);
                    }
                  }}
                  devToolsFor={pane.devToolsFor}
                  chromeless={pane.chromeless}
                  isDevToolsOpen={ctx.devToolsTargets.has(pane.id)}
                  onToggleDevTools={() => {
                    const devToolsPane = Object.values(tab.panes).find(
                      (p) => p.type === "browser" && p.devToolsFor === pane.id,
                    );
                    if (devToolsPane) {
                      closePane(tab.id, devToolsPane.id);
                    } else {
                      openBrowserPane(
                        tab.id,
                        pane.id,
                        "about:blank",
                        "column",
                        false,
                        true,
                      );
                    }
                  }}
                  onHideToolbar={() =>
                    updatePaneProperty(tab.id, pane.id, { chromeless: true })
                  }
                />
              </div>
            ) : pane.type === "canvas" ? (
              <div
                className="flex flex-1 w-full h-full min-h-0 min-w-0"
                onContextMenu={onPaneContextMenu}
                onMouseDown={onPaneActivate}
              >
                <CanvasPane
                  key={pane.id}
                  pane={pane}
                  paneId={pane.id}
                  tabId={tab.id}
                  onContextMenu={onPaneContextMenu}
                />
              </div>
            ) : null}
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
    },
    [
      activePaneId,
      activeTabId,
      applicationMode,
      createDragHandlers,
      createDropHandlers,
      handleContextMenu,
      handleEditorUpdate,
      handleBrowserUpdate,
      isInDesignMode,
      onOpenQuickPane,
      renderDropZone,
      shouldShowTerminalDimensions,
      resizingNode,
      setHoveredPaneId,
      draggedPaneId,
      dragHoverPaneId,
      hoveredPaneId,
      isTabInPreview,
      hoveredPreviewPaneId,
      setHoveredPreviewPaneId,
      setApplicationMode,
      setPaneCollapsed,
      dimInactivePanes,
    ],
  );

  const renderSplitNode = useCallback(
    (
      node: LayoutSplitNode,
      tab: Tab,
      renderChild: (
        node: LayoutNode,
        tab: Tab,
        hasUnifiedSandbox: boolean,
        ctx: TabRenderContext,
        parentDirection: SplitDirection,
      ) => React.ReactNode,
      hasUnifiedSandbox: boolean,
      ctx: TabRenderContext,
    ): React.ReactNode => {
      const isInFocusMode = applicationMode === "focus";
      const isLocked = tab.locked;
      const isInPreview = isTabInPreview(tab.id);

      // Generate the grid template for this split
      const gridTemplate = buildGridTemplateStyles(
        node.children,
        node.direction,
        tab.activePaneId,
        isInFocusMode,
      );

      // Use grid gap to create spaces that reveal the overlay underneath
      // Hide gaps in focus mode, design mode, and preview mode (use borders instead in preview)
      const gridGapClass =
        applicationMode === "focus" ||
        applicationMode === "design" ||
        isInPreview
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
            const previousSibling =
              index !== 0 ? node.children[index - 1] : null;
            const isBeingResized = resizingNode === child.id;

            // In design mode, add dashed borders as visual indicators (overlaid on content)
            // In preview mode, add solid borders to replace grid gaps
            const designModeBorderClass = isInDesignMode
              ? `${node.direction === "row" ? "border-l" : "border-t"} border-accent border-dashed`
              : "";
            const previewBorderClass = isInPreview
              ? `${node.direction === "row" ? "border-l" : "border-t"} border-border`
              : "";
            const splitBorderClass =
              index !== 0 && (isInDesignMode || isInPreview)
                ? isInDesignMode
                  ? designModeBorderClass
                  : previewBorderClass
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
              primaryAxis !== null &&
              !isInFocusMode &&
              !isLocked &&
              (previousSibling.type === "split" ||
                (previousSibling.type === "pane" &&
                  !previousSibling.collapsed));

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

                {renderChild(
                  child,
                  tab,
                  hasUnifiedSandbox,
                  ctx,
                  node.direction,
                )}
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
      isTabInPreview,
      resizingNode,
      setHoverKeys,
    ],
  );

  const renderLayout = useCallback(
    (
      node: LayoutNode,
      tab: Tab,
      hasUnifiedSandbox: boolean,
      ctx: TabRenderContext,
      parentDirection?: SplitDirection,
    ) => {
      if (node.type === "pane") {
        return renderPaneNode(
          node,
          tab,
          hasUnifiedSandbox,
          ctx,
          parentDirection,
        );
      }
      return renderSplitNode(node, tab, renderLayout, hasUnifiedSandbox, ctx);
    },
    [renderPaneNode, renderSplitNode],
  );

  const isFocusModeActive = applicationMode === "focus";

  const renderTab = useCallback(
    (tab: Tab): React.ReactNode => {
      const isActive = tab.id === activeTabId;

      // If this is the first time we're rendering this tab, create and store
      // its container ref callback that sets up the portal mount point.
      if (!tabContainerCallbackRefs.current[tab.id]) {
        tabContainerCallbackRefs.current[tab.id] = (
          node: HTMLDivElement | null,
        ) => setLayoutMountPoint(tab.id, node);
      }

      // Get the ref callback for this tab container and it's active
      // mount point, which is either the tab or the tab preview hover.
      const tabContainerRef = tabContainerCallbackRefs.current[tab.id];
      const portalTarget = getActiveMountPoint(tab.id);

      // Check if all panes share the same sandbox context
      const unifiedSandbox = getUnifiedSandboxForTab(tab);
      const hasUnifiedSandbox = unifiedSandbox !== null;

      // Pre-compute values that would otherwise be calculated per-pane
      const ctx: TabRenderContext = {
        paneCount: countPanesInLayout(tab.layout),
        devToolsTargets: new Set(
          Object.values(tab.panes)
            .filter((p) => p.type === "browser" && p.devToolsFor)
            .map((p) => (p as { devToolsFor: string }).devToolsFor),
        ),
        isOnlyTab: tabs.length === 1,
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
        <div
          key={tab.id}
          role="tabpanel"
          aria-hidden={!isActive}
          className={
            isActive
              ? "flex-1 flex min-h-0 min-w-0 overflow-hidden relative"
              : "flex-1 hidden min-h-0 min-w-0 overflow-hidden relative"
          }
          ref={tabContainerRef}
          onDragOver={tabDropHandlers?.onDragOver}
          onDragLeave={tabDropHandlers?.onDragLeave}
          onDrop={tabDropHandlers?.onDrop}
        >
          {portalTarget ? createPortal(tabContent, portalTarget) : null}

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
        </div>
      );
    },
    [
      activeTabId,
      getActiveMountPoint,
      renderLayout,
      setLayoutMountPoint,
      createTabContainerDropHandlers,
      isInDesignMode,
      draggedPaneId,
      tabEdgeDropZone,
    ],
  );

  return (
    <div className="flex-1 flex relative min-h-0 overflow-hidden">
      {tabs.map((tab) => (
        <Activity
          key={tab.id}
          mode={
            tab.id === activeTabId || isTabInPreview(tab.id)
              ? "visible"
              : "hidden"
          }
        >
          {renderTab(tab)}
        </Activity>
      ))}

      {isFocusModeActive && <FocusModeIndicator />}

      {/* Centered "Preparing..." message when there are no tabs */}
      {tabs.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center justify-center bg-elevated p-4 rounded-md border border-elevated-border text-sm">
            Preparing terminal...
          </div>
        </div>
      )}
    </div>
  );
}
