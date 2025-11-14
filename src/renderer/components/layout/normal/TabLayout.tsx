import { PaneControlButtons } from "@/components/layout/design/PaneControlButtons";
import { FocusModeIndicator } from "@/components/layout/focus/FocusModeIndicator";
import { IntersectionHandles } from "@/components/layout/normal/IntersectionHandles";
import { PaneHighlight } from "@/components/layout/normal/PaneHighlight";
import { ResizeHandle } from "@/components/layout/normal/ResizeHandle";
import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { usePaneDragDrop } from "@/components/layout/normal/usePaneDragDrop";
import { BrowserPane } from "@/components/panes/browser/BrowserPane";
import { EditorPane } from "@/components/panes/editor/EditorPane";
import { SandboxIndicator } from "@/components/panes/terminal/SandboxIndicator";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import type { PaneDescriptor } from "@/components/shell/QuickDialog";
import type {
  LayoutResizeAxis,
  LayoutResizeStartConfig,
} from "@/hooks/useLayoutResizing";
import {
  handleCompleteAgentSessionAction,
  handleDeleteAgentSessionAction,
  handleForkVMAction,
} from "@/hooks/useSandboxHandlers";
import { enterFocusMode } from "@/store/actions/focusMode";
import { activatePane, openWebViewPane } from "@/store/actions/pane";
import { hasNeighborPane } from "@/store/actions/paneNavigation";
import { focusTab } from "@/store/actions/tab";
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
import { countPanesInLayout, layoutContainsPaneId } from "@/utils/layout";
import { getUnifiedSandboxForTab } from "@/utils/sandbox";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const INTERSECTION_TOLERANCE = 0.08;

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
  const activeTab = useAtomValue(activeTabAtom);
  const activePaneId = useAtomValue(activePaneIdAtom);
  const activeTabId = activeTab?.id ?? null;
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";

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
    (
      node: LayoutPaneNode,
      tab: Tab,
      hasUnifiedSandbox: boolean,
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

      const dragHandlers = isLocked
        ? { onDragStart: () => {}, onDragEnd: () => {} }
        : createDragHandlers(pane.id, tab.id);
      const dropHandlers = isLocked
        ? {
            onDragOver: () => {},
            onDragLeave: () => {},
            onDrop: () => {},
          }
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
                cwd={pane.cwd}
                isActive={isActivePane}
                onActivate={onPaneActivate}
                onContextMenu={onPaneContextMenu}
                onLinkClick={(url) => openWebViewPane(tab.id, pane.id, url)}
                showDimensions={shouldShowTerminalDimensions && !isInPreview}
                hideIndividualSandboxIndicator={hasUnifiedSandbox}
              />
            ) : pane.type === "editor" ? (
              <div
                className="flex flex-1 w-full h-full min-h-0 min-w-0"
                onContextMenu={onPaneContextMenu}
                onMouseDown={onPaneActivate}
              >
                <EditorPane
                  key={pane.id}
                  paneId={pane.id}
                  cwd={pane.cwd}
                  filePath={pane.filePath}
                  agentSessionId={pane.agentSessionId}
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
                  hideIndividualSandboxIndicator={hasUnifiedSandbox}
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
            <div className="pointer-events-none absolute inset-0 z-10 bg-accent/20 backdrop-blur-[0.5px]" />
          )}

          {/* Pane highlight overlay */}
          <PaneHighlight paneId={pane.id} isResizing={resizingNode !== null} />

          {/* Preview hover overlay - show blue highlight when hovering pane in preview */}
          {isInPreview && hoveredPreviewPaneId === pane.id && (
            <div className="pointer-events-none absolute inset-0 z-20 bg-accent/30 backdrop-blur-[0.5px]" />
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
      setApplicationMode,
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
      ) => React.ReactNode,
      hasUnifiedSandbox: boolean,
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

      // Use grid gap to create spaces that reveal the overlay underneath
      // Hide gaps only in focus mode where we want a seamless view
      // Use larger gaps in overview mode to compensate for scaling
      const gridGapClass =
        applicationMode === "focus" || applicationMode === "design"
          ? "gap-0"
          : applicationMode === "overview"
            ? "gap-[3px]"
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
            // Grid gap handles the spacing that reveals the overlay underneath
            const designModeBorderClass = isInDesignMode
              ? `${node.direction === "row" ? "border-l" : "border-t"} border-accent border-dashed`
              : "";
            const splitBorderClass =
              index !== 0 && isInDesignMode ? designModeBorderClass : "";

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

            const shouldRenderHandles =
              primaryAxis !== null && !isInFocusMode && !isLocked;

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

                {renderChild(child, tab, hasUnifiedSandbox)}
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
    (node: LayoutNode, tab: Tab, hasUnifiedSandbox: boolean) => {
      if (node.type === "pane") {
        return renderPaneNode(node, tab, hasUnifiedSandbox);
      }
      return renderSplitNode(node, tab, renderLayout, hasUnifiedSandbox);
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

      const tabContent = (
        <>{renderLayout(tab.layout, tab, hasUnifiedSandbox)}</>
      );

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
        >
          {portalTarget ? createPortal(tabContent, portalTarget) : null}
          {unifiedSandbox && (
            <SandboxIndicator
              vmId={unifiedSandbox.type === "vm" ? unifiedSandbox.vmId : null}
              agentSessionId={
                unifiedSandbox.type === "agent"
                  ? unifiedSandbox.agentSessionId
                  : null
              }
              onCompleteAgentSession={
                unifiedSandbox.type === "agent"
                  ? () =>
                      handleCompleteAgentSessionAction(
                        tab.id,
                        unifiedSandbox.agentSessionId,
                      )
                  : undefined
              }
              onDeleteAgentSession={
                unifiedSandbox.type === "agent"
                  ? () =>
                      handleDeleteAgentSessionAction(
                        tab.id,
                        unifiedSandbox.agentSessionId,
                      )
                  : undefined
              }
              onForkVM={
                unifiedSandbox.type === "vm"
                  ? () =>
                      handleForkVMAction(
                        tab.id,
                        tab.activePaneId,
                        unifiedSandbox.vmId,
                      )
                  : undefined
              }
            />
          )}
        </div>
      );
    },
    [activeTabId, getActiveMountPoint, renderLayout, setLayoutMountPoint],
  );

  return (
    <div className="flex-1 flex relative min-h-0 overflow-hidden">
      {tabs.map(renderTab)}

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
