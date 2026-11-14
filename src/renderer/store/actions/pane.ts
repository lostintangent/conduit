import { deleteCanvasState } from "@features/canvas/client/canvasStore";
import { disposeEditorPane } from "@/components/panes/editor";
import {
  disposeSession,
  getTerminalCellWidth,
  getTerminalSize,
} from "@features/terminal/client/xtermCache";
import { exitFocusMode, isFocusModeActive } from "@/store/actions/focusMode";
import { enqueueNotification } from "@/store/actions/notifications";
import { closeTab } from "@/store/actions/tab";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type {
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  Pane,
  SplitDirection,
  Tab,
  TerminalPane,
} from "@/types";
import {
  getPaneDirectionConfig,
  layoutContainsPaneId,
  walkLayout,
  type PaneDirection,
} from "@/utils/layout";
import type {
  AgentSessionCleanupResult,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
} from "@shared/types";
import type { TerminalCreateOptions } from "@features/terminal/model";
import { generateId } from "@shared/utils";
import { produce } from "immer";

const api = window.conduit;

// Internal utilities

function splitLayoutNode(
  node: LayoutNode,
  targetPaneId: string,
  direction: SplitDirection,
  newNode: LayoutNode,
  insertBefore = false,
): { node: LayoutNode; modified: boolean } {
  if (node.type === "pane") {
    if (node.paneId === targetPaneId) {
      return {
        node: {
          id: generateId(),
          type: "split",
          direction,
          children: insertBefore ? [newNode, node] : [node, newNode],
        },
        modified: true,
      };
    }

    return { node, modified: false };
  }

  const childIndex = node.children.findIndex((child) =>
    layoutContainsPaneId(child, targetPaneId),
  );
  if (childIndex === -1) {
    return { node, modified: false };
  }

  // The target child contains the pane, so recursing into it always splits.
  const targetChild = node.children[childIndex];
  const newChildren = [...node.children];
  if (
    node.direction === direction &&
    targetChild.type === "pane" &&
    targetChild.paneId === targetPaneId
  ) {
    newChildren.splice(insertBefore ? childIndex : childIndex + 1, 0, newNode);
  } else {
    newChildren[childIndex] = splitLayoutNode(
      targetChild,
      targetPaneId,
      direction,
      newNode,
      insertBefore,
    ).node;
  }

  return { node: { ...node, children: newChildren }, modified: true };
}

type AgentPaneFields = Pick<
  TerminalPane,
  | "agentSessionId"
  | "agentBranchName"
  | "agentBaseBranch"
  | "agentRepoRoot"
  | "agentWorktreePath"
>;

/** Agent-session metadata for a new pane: `session` wins over `source`. */
export function inheritAgentSession(
  session: AgentSessionInfo | undefined,
  source: Partial<AgentPaneFields> = {},
): AgentPaneFields {
  return {
    agentSessionId: session?.id ?? source.agentSessionId,
    agentBranchName: session?.branchName ?? source.agentBranchName,
    agentBaseBranch: session?.baseBranch ?? source.agentBaseBranch,
    agentRepoRoot: session?.repoRoot ?? source.agentRepoRoot,
    agentWorktreePath: session?.worktreePath ?? source.agentWorktreePath,
  };
}

function findFirstPaneId(node: LayoutNode): string {
  if (node.type === "pane") {
    return node.paneId;
  }

  return findFirstPaneId(node.children[0]);
}

export type LayoutPathEntry = {
  node: LayoutNode;
  parent: LayoutSplitNode | null;
  index: number;
};

export function findLayoutPath(
  node: LayoutNode,
  predicate: (candidate: LayoutNode) => boolean,
  parent: LayoutSplitNode | null = null,
  index = 0,
): LayoutPathEntry[] | null {
  const currentEntry: LayoutPathEntry = { node, parent, index };
  if (predicate(node)) {
    return [currentEntry];
  }

  if (node.type !== "split") {
    return null;
  }

  for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
    const child = node.children[childIndex];
    const childPath = findLayoutPath(child, predicate, node, childIndex);
    if (childPath) {
      return [currentEntry, ...childPath];
    }
  }

  return null;
}

export function setPaneCollapsed(
  tabId: string,
  paneId: string,
  collapsed: boolean,
): void {
  // Note: This method is only expected to be called from the collapse/expand
  // commands, which are already guarded by checks for whether the pane can be
  // collapsed or expanded. So we're not repeating those checks here. That said,
  // this function shouldn't be called directly from unguarded locations.

  tabsAtom.set(
    produce((tabs) => {
      // Find the layout node for the pane and update its collapsed state
      const tab = tabs.find(({ id }) => id === tabId);
      if (!tab) return;

      walkLayout(tab.layout, ({ node, parent }) => {
        if (node.type === "pane" && node.paneId === paneId) {
          if (collapsed) {
            node.collapsed = true;

            if (tab.activePaneId === paneId) {
              // If the pane being minimized is then active
              // pane, then let's find its first non-minimized
              // sibling, and make that the active pane instead.
              const siblingPaneId = parent?.children
                .filter(
                  (child) =>
                    child.type === "pane" &&
                    child.id !== node.id &&
                    !child.collapsed,
                )
                .map((sibling) => findFirstPaneId(sibling))
                .find(Boolean);

              if (siblingPaneId) {
                tab.activePaneId = siblingPaneId;
              }
            }
          } else {
            // When expanding a collapsed pane, we
            // remove the collapsed property, since
            // that is the default state and doesn't
            // need to be persisted to the workspace.
            delete node.collapsed;

            // Activate the pane when restoring it
            tab.activePaneId = paneId;
          }

          return false;
        }
      });
    }),
  );
}

type ExtractPaneResult = {
  node: LayoutNode | null;
  removedPane: LayoutPaneNode | null;
};

/**
 * Remove a pane from a layout, collapsing splits left with a single child.
 * `removedPane` is null (and `node` unchanged) when the pane isn't found.
 */
function extractPaneNode(node: LayoutNode, paneId: string): ExtractPaneResult {
  if (node.type === "pane") {
    return node.paneId === paneId
      ? { node: null, removedPane: node }
      : { node, removedPane: null };
  }

  let removedPane: LayoutPaneNode | null = null;
  const newChildren: LayoutNode[] = [];

  node.children.forEach((child) => {
    if (removedPane) {
      newChildren.push(child);
      return;
    }

    const result = extractPaneNode(child, paneId);
    removedPane = result.removedPane;
    if (result.node) {
      newChildren.push(result.node);
    }
  });

  if (!removedPane) {
    return { node, removedPane: null };
  }

  if (newChildren.length <= 1) {
    return { node: newChildren[0] ?? null, removedPane };
  }

  return { node: { ...node, children: newChildren }, removedPane };
}

export function updatePaneProperty<T extends Pane>(
  tabId: string,
  paneId: string,
  updates: Partial<T>,
) {
  tabsAtom.set(
    produce((tabs) => {
      const tab = tabs.find(({ id }) => id === tabId);
      const pane = tab?.panes[paneId];
      if (!pane) return;

      Object.assign(pane, updates);
    }),
  );
}

export function updateTerminalSessionProperty(
  sessionId: string,
  updates: Partial<TerminalPane>,
) {
  tabsAtom.set(
    produce((tabs) => {
      for (const tab of tabs) {
        for (const pane of Object.values(tab.panes)) {
          if (pane.type === "terminal" && pane.sessionId === sessionId) {
            Object.assign(pane, updates);
          }
        }
      }
    }),
  );
}

export function movePane(
  tabId: string,
  paneId: string,
  direction: PaneDirection,
) {
  tabsAtom.set(
    produce((current) =>
      current.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }

        if (tab.locked) {
          return tab;
        }

        if (!tab.panes[paneId]) {
          return tab;
        }

        const path = findLayoutPath(
          tab.layout,
          (candidate) =>
            candidate.type === "pane" && candidate.paneId === paneId,
        );

        if (!path || path.length < 2) {
          return tab;
        }

        const { splitDirection: targetDirection, isForward } =
          getPaneDirectionConfig(direction);

        for (let i = path.length - 2; i >= 0; i -= 1) {
          const ancestorEntry = path[i];
          if (
            ancestorEntry.node.type !== "split" ||
            ancestorEntry.node.direction !== targetDirection
          ) {
            continue;
          }

          const childEntry = path[i + 1];
          const neighborIndex = childEntry.index + (isForward ? 1 : -1);
          if (
            neighborIndex < 0 ||
            neighborIndex >= ancestorEntry.node.children.length
          ) {
            continue;
          }

          const sourceNode = ancestorEntry.node.children[childEntry.index];
          const originalChildSize = sourceNode.size;
          const detachResult = extractPaneNode(sourceNode, paneId);
          if (!detachResult.removedPane) {
            continue;
          }

          const neighborNodeId = ancestorEntry.node.children[neighborIndex].id;
          const newChildren = [...ancestorEntry.node.children];

          if (detachResult.node) {
            const updatedChild =
              originalChildSize !== undefined &&
              detachResult.node.size === undefined
                ? { ...detachResult.node, size: originalChildSize }
                : detachResult.node;
            newChildren[childEntry.index] = updatedChild;
          } else {
            newChildren.splice(childEntry.index, 1);
          }

          const neighborPosition = newChildren.findIndex(
            (candidate) => candidate.id === neighborNodeId,
          );
          if (neighborPosition === -1) {
            continue;
          }

          const insertIndex = isForward
            ? neighborPosition + 1
            : neighborPosition;
          newChildren.splice(insertIndex, 0, detachResult.removedPane);

          const updatedAncestor: LayoutNode = {
            ...ancestorEntry.node,
            children: newChildren,
          };

          let updatedNode: LayoutNode | null = updatedAncestor;
          for (let j = i - 1; j >= 0; j -= 1) {
            const parentEntry = path[j];
            if (parentEntry.node.type !== "split") {
              continue;
            }

            const childIndex = path[j + 1].index;
            const parentChildren = [...parentEntry.node.children];

            if (updatedNode) {
              parentChildren[childIndex] = updatedNode;
            } else {
              parentChildren.splice(childIndex, 1);
            }

            if (parentChildren.length === 0) {
              updatedNode = null;
            } else if (parentChildren.length === 1) {
              updatedNode = parentChildren[0];
            } else {
              updatedNode = {
                ...parentEntry.node,
                children: parentChildren,
              };
            }
          }

          if (!updatedNode) {
            return tab;
          }

          return {
            ...tab,
            layout: updatedNode,
          };
        }

        return tab;
      }),
    ),
  );
}

type DetachPaneResult = {
  pane: Pane;
  tabClosed: boolean;
};

export function detachPane(
  tabId: string,
  paneId: string,
): DetachPaneResult | null {
  const tabs = tabsAtom.get();
  const targetTab = tabs.find((tab) => tab.id === tabId);
  if (!targetTab) {
    return null;
  }

  if (targetTab.locked) {
    return null;
  }

  const targetPane = targetTab.panes[paneId];
  if (!targetPane) {
    return null;
  }

  let detachedPane: Pane | null = null;
  let tabClosed = false;
  let removedTabIndex = -1;
  const previousActiveTabId = activeTabIdAtom.get();
  let removedTabWasActive = false;
  let nextActiveTabId: string | null | undefined = undefined;

  tabsAtom.set(
    produce((current) => {
      const next: Tab[] = [];

      current.forEach((tab, index) => {
        if (tab.id !== tabId) {
          next.push(tab);
          return;
        }

        removedTabIndex = index;
        const pane = tab.panes[paneId];
        if (!pane) {
          next.push(tab);
          return;
        }

        const { node: newLayout, removedPane } = extractPaneNode(
          tab.layout,
          paneId,
        );

        if (!removedPane) {
          next.push(tab);
          return;
        }

        // Use the pre-detach snapshot so callers don't receive an Immer draft
        detachedPane = targetPane;
        const newPanes = { ...tab.panes };
        delete newPanes[paneId];

        if (!newLayout || Object.keys(newPanes).length === 0) {
          tabClosed = true;
          removedTabWasActive = tab.id === previousActiveTabId;
          return;
        }

        const newActivePaneId =
          tab.activePaneId === paneId
            ? findFirstPaneId(newLayout)
            : tab.activePaneId;

        next.push({
          ...tab,
          panes: newPanes,
          layout: newLayout,
          activePaneId: newActivePaneId,
        });
      });

      if (tabClosed) {
        if (removedTabWasActive) {
          if (next.length > 0) {
            const targetIndex =
              removedTabIndex >= next.length
                ? next.length - 1
                : removedTabIndex;
            nextActiveTabId = next[targetIndex]?.id ?? null;
          } else {
            nextActiveTabId = null;
          }
        } else if (next.length === 0) {
          nextActiveTabId = null;
        }
      }

      return next;
    }),
  );

  if (nextActiveTabId !== undefined) {
    activeTabIdAtom.set(nextActiveTabId);
  }

  if (!detachedPane) {
    return null;
  }

  return { pane: detachedPane, tabClosed };
}

// The width a terminal pane spends outside its columns: TerminalPane's 8px
// left padding and xterm's 14px scrollbar.
const TERMINAL_CHROME_WIDTH = 22;

/**
 * Estimates the size of a pane split from `paneId`, scaling the source pane's
 * size by the new pane's share of it. This errs narrow, because a shell that
 * starts wider than its pane wraps its first prompt when the pane fits.
 */
function getSplitTerminalSize(
  layout: LayoutNode,
  paneId: string,
  direction: SplitDirection,
): { cols: number; rows: number } | undefined {
  const size = getTerminalSize(paneId);
  if (!size) return undefined;

  // Splitting into the pane's parent adds a sibling with the default weight,
  // while splitting anywhere else halves the pane.
  let share = 1 / 2;
  walkLayout(layout, ({ node, parent }) => {
    if (node.type !== "pane" || node.paneId !== paneId) return true;
    if (parent?.direction === direction) {
      const total = parent.children
        .filter((child) => !(child.type === "pane" && child.collapsed))
        .reduce((sum, child) => sum + (child.size ?? 1), 0);
      share = total / ((node.size ?? 1) * (total + 1));
    }
    return false;
  });

  if (direction === "column") {
    return {
      cols: size.cols,
      rows: Math.max(1, Math.floor(size.rows * share)),
    };
  }
  // Scaling the columns scales the source pane's chrome too, but the new pane
  // has all of its own, a 1px grid gap, and up to 1px that FitAddon rounds
  // off its width. Taking that off in columns errs narrow at any font size.
  const cellWidth = getTerminalCellWidth(paneId);
  if (!cellWidth) return undefined;
  const chromeCols = (TERMINAL_CHROME_WIDTH * (1 - share) + 2) / cellWidth;
  return {
    cols: Math.max(1, Math.floor(size.cols * share - chromeCols)),
    rows: size.rows,
  };
}

type SplitPaneOptions = {
  terminalOptions?: TerminalCreateOptions;
  agentSession?: AgentSessionInfo;
};

export async function splitPane(
  tabId: string,
  paneId: string,
  direction: SplitDirection,
  insertBefore = false,
  options: SplitPaneOptions = {},
) {
  const tabs = tabsAtom.get();
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) {
    return;
  }

  if (tab.locked) {
    return;
  }

  const sourcePane = tab.panes[paneId];
  if (!sourcePane) {
    return;
  }

  // Terminals and editors both have a folder and may belong to an agent
  // session, so a split from either starts there and stays in that session.
  const sourceFolderPane =
    sourcePane.type === "terminal" || sourcePane.type === "editor"
      ? sourcePane
      : undefined;

  const defaultCwd = sourceFolderPane?.cwd ?? undefined;

  // A split in the visible tab from a pane that can't be measured, like an
  // editor or a pane that hasn't fit yet, starts its shell once it has fit.
  const size =
    getSplitTerminalSize(tab.layout, paneId, direction) ??
    (tabId === activeTabIdAtom.get() ? { waitForSize: true } : undefined);

  const result = await api.terminal.create({
    ...size,
    ...(options.terminalOptions ?? { cwd: defaultCwd }),
  });
  if (!result) {
    return;
  }

  const newPaneState: Pane = {
    id: generateId(),
    type: "terminal",
    sessionId: result.sessionId,
    cwd: result.cwd ?? null,
    title: result.title,
    ...inheritAgentSession(options.agentSession, sourceFolderPane),
  };

  insertPaneNextTo(tabId, paneId, newPaneState, direction, insertBefore);

  return newPaneState;
}

type PaneDropTarget = {
  tabId: string;
  direction: SplitDirection;
  insertBefore: boolean;
  /** Split next to this pane, or wrap the tab's whole layout when omitted */
  targetPaneId?: string;
};

/**
 * Move a dragged pane next to another pane, or to an edge of a tab, in the
 * same tab or another one. Returns false and changes nothing when the target
 * can't take the pane, so a drop never detaches a pane it can't re-insert.
 */
export function dropPane(
  sourceTabId: string,
  paneId: string,
  target: PaneDropTarget,
): boolean {
  const targetTab = tabsAtom.get().find((tab) => tab.id === target.tabId);
  if (!targetTab || targetTab.locked) {
    return false;
  }

  if (target.targetPaneId) {
    if (
      target.targetPaneId === paneId ||
      !targetTab.panes[target.targetPaneId]
    ) {
      return false;
    }
  } else if (
    sourceTabId === target.tabId &&
    Object.keys(targetTab.panes).length === 1
  ) {
    // Detaching a tab's only pane closes the tab before it could be re-inserted
    return false;
  }

  const detached = detachPane(sourceTabId, paneId);
  if (!detached) {
    return false;
  }

  if (target.targetPaneId) {
    insertPaneNextTo(
      target.tabId,
      target.targetPaneId,
      detached.pane,
      target.direction,
      target.insertBefore,
    );
  } else {
    insertPaneAtTabRoot(
      target.tabId,
      detached.pane,
      target.direction,
      target.insertBefore,
    );
  }
  return true;
}

/**
 * Insert an existing pane at the root level of the tab layout.
 * Used by drag/drop to create full-width or full-height panes.
 */
function insertPaneAtTabRoot(
  tabId: string,
  pane: Pane,
  direction: SplitDirection,
  insertBefore = false,
) {
  tabsAtom.set(
    produce((current) =>
      current.map((currentTab) => {
        if (currentTab.id !== tabId) {
          return currentTab;
        }

        if (currentTab.locked) {
          return currentTab;
        }

        const newLayoutNode: LayoutNode = {
          id: generateId(),
          type: "pane",
          paneId: pane.id,
        };

        // Wrap entire existing layout in a new split at root level
        const newLayout: LayoutSplitNode = {
          id: generateId(),
          type: "split",
          direction,
          children: insertBefore
            ? [newLayoutNode, currentTab.layout]
            : [currentTab.layout, newLayoutNode],
        };

        return {
          ...currentTab,
          panes: {
            ...currentTab.panes,
            [pane.id]: pane,
          },
          layout: newLayout,
          activePaneId: pane.id,
        };
      }),
    ),
  );
}

/**
 * Insert a pane next to a target pane (splitting it in the given direction)
 * and make it the active pane.
 */
export function insertPaneNextTo(
  tabId: string,
  targetPaneId: string,
  pane: Pane,
  direction: SplitDirection,
  insertBefore = false,
) {
  const newLayoutNode: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: pane.id,
  };

  tabsAtom.set(
    produce((current) =>
      current.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }

        const { node: newLayout, modified } = splitLayoutNode(
          tab.layout,
          targetPaneId,
          direction,
          newLayoutNode,
          insertBefore,
        );

        if (!modified) {
          return tab;
        }

        return {
          ...tab,
          panes: {
            ...tab.panes,
            [pane.id]: pane,
          },
          layout: newLayout,
          activePaneId: pane.id,
        };
      }),
    ),
  );
}

export async function splitPaneWithAgentSession(
  tabId: string,
  paneId: string,
  direction: SplitDirection,
  insertBefore = false,
) {
  const tabs = tabsAtom.get();
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) {
    return;
  }

  if (tab.locked) {
    return;
  }

  const sourcePane = tab.panes[paneId];
  if (!sourcePane) {
    return;
  }

  const paneCwd =
    sourcePane.type === "terminal" || sourcePane.type === "editor"
      ? (sourcePane.cwd ?? undefined)
      : undefined;

  if (!paneCwd) {
    return;
  }

  try {
    const session = await api.spawnAgentSession({ cwd: paneCwd });
    if (!session) {
      return;
    }

    await splitPane(tabId, paneId, direction, insertBefore, {
      terminalOptions: { cwd: session.worktreePath },
      agentSession: session,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("Unable to find a Git repository")) {
      enqueueNotification({
        kind: "error",
        message: "No Git repository found",
        details:
          "The current directory is not part of a Git repository. Agent sessions require a Git repository to create an isolated worktree.",
        autoCloseMs: 5000,
      });
    } else {
      enqueueNotification({
        kind: "error",
        message: "Failed to spawn agent session",
        details: errorMessage,
        autoCloseMs: 5000,
      });
    }
    console.error("Failed to spawn agent session during split", error);
  }
}

export function openBrowserPane(
  tabId: string,
  paneId: string,
  url: string,
  direction: SplitDirection = "row",
  insertBefore = false,
  devTools = false,
) {
  const newPaneId = generateId();
  const newPaneState: Pane = {
    id: newPaneId,
    type: "browser",
    url,
    ...(devTools && { devToolsFor: paneId }),
  };

  insertPaneNextTo(tabId, paneId, newPaneState, direction, insertBefore);
}

type OpenEditorPaneOptions = {
  file?: string;
  preview?: boolean;
};

export function openEditorPane(
  tabId: string,
  paneId: string,
  cwd: string,
  direction: SplitDirection = "row",
  insertBefore = false,
  options: OpenEditorPaneOptions = {},
) {
  const newPaneId = generateId();
  const newPaneState: Pane = {
    id: newPaneId,
    type: "editor",
    cwd,
    file: options.file,
    preview: options.preview,
  };

  insertPaneNextTo(tabId, paneId, newPaneState, direction, insertBefore);

  return newPaneId;
}

export function openCanvasPane(
  tabId: string,
  paneId: string,
  direction: SplitDirection = "row",
  insertBefore = false,
) {
  const newPaneId = generateId();
  const newPaneState: Pane = {
    id: newPaneId,
    type: "canvas",
  };

  insertPaneNextTo(tabId, paneId, newPaneState, direction, insertBefore);

  return newPaneId;
}

export function cloneTerminalPane(
  tabId: string,
  paneId: string,
  direction: SplitDirection = "row",
  insertBefore = false,
) {
  // Note: This method is only expected to be called from the clone
  // command, which is already guarded by checks for whether the pane
  // can be cloned. So we're not repeating those checks here.
  const tab = tabsAtom.get().find(({ id }) => id === tabId);
  const sourcePane = tab?.panes[paneId] as TerminalPane | undefined;
  if (!sourcePane) return;

  insertPaneNextTo(
    tabId,
    paneId,
    { ...sourcePane, id: generateId(), cloneOf: sourcePane.cloneOf ?? paneId },
    direction,
    insertBefore,
  );
}

type RemovePaneOptions = {
  skipTerminalClose?: boolean;
};

export function removePane(
  tabId: string,
  paneId: string,
  options: RemovePaneOptions = {},
) {
  tabsAtom.set(
    produce((current) =>
      current.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }

        if (tab.locked) {
          return tab;
        }

        const pane = tab.panes[paneId];
        if (!pane) {
          return tab;
        }

        const { node: newLayout, removedPane } = extractPaneNode(
          tab.layout,
          paneId,
        );

        if (!removedPane || !newLayout) {
          return tab;
        }

        if (pane.type === "terminal") {
          // Check if there are other panes across all tabs sharing this session
          const allTabs = tabsAtom.get();
          const otherPanesWithSameSession = allTabs.flatMap((t) =>
            Object.values(t.panes).filter(
              (p) =>
                p.id !== paneId &&
                p.type === "terminal" &&
                p.sessionId === pane.sessionId,
            ),
          );

          // Only close the PTY if this is the last pane using this session
          if (
            otherPanesWithSameSession.length === 0 &&
            !options.skipTerminalClose
          ) {
            api.terminal.close(pane.sessionId);
          }
          // Always dispose the xterm instance for this specific pane
          disposeSession(paneId);
        } else if (pane.type === "editor") {
          // Dispose the editor pane from EditorPaneRegistry
          // This fully removes the editor (vs detach which just moves it off-screen)
          disposeEditorPane(pane.id);
        } else if (pane.type === "canvas") {
          // Clean up canvas state (including history) from the global store
          deleteCanvasState(paneId);
        }

        const newPanes = { ...tab.panes };
        delete newPanes[paneId];

        const newActivePaneId =
          tab.activePaneId === paneId
            ? findFirstPaneId(newLayout)
            : tab.activePaneId;

        const removedActivePane = tab.activePaneId === paneId;

        // If we're removing the active pane while in focus mode, exit focus mode
        if (removedActivePane && isFocusModeActive()) {
          exitFocusMode();
        }

        return {
          ...tab,
          panes: newPanes,
          layout: newLayout,
          activePaneId: newActivePaneId,
        };
      }),
    ),
  );
}

export function closeAgentSessionPanes(
  tabId: string,
  agentSessionId: string,
): number {
  const tabs = tabsAtom.get();
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) {
    return 0;
  }

  const paneIds = Object.entries(tab.panes)
    .filter(
      ([, pane]) =>
        (pane.type === "terminal" || pane.type === "editor") &&
        pane.agentSessionId === agentSessionId,
    )
    .map(([paneId]) => paneId);

  paneIds.forEach((paneId) => {
    closePane(tabId, paneId);
  });

  return paneIds.length;
}

export async function completeAgentSession(
  tabId: string,
  agentSessionId: string,
): Promise<AgentSessionFinalizeResult | null> {
  const result = await api.finalizeAgentSession({ sessionId: agentSessionId });

  if (result.status !== "conflict") {
    closeAgentSessionPanes(tabId, agentSessionId);
  }

  return result;
}

export async function deleteAgentSession(
  tabId: string,
  agentSessionId: string,
): Promise<AgentSessionCleanupResult | null> {
  const result = await api.cleanupAgentSession({ sessionId: agentSessionId });

  closeAgentSessionPanes(tabId, agentSessionId);

  return result;
}

export function activatePane(tabId: string, paneId: string) {
  tabsAtom.set(
    produce((tabs) => {
      const tab = tabs.find(({ id }) => id === tabId);
      if (!tab || tab.activePaneId === paneId) {
        return tabs;
      }

      tab.activePaneId = paneId;
    }),
  );
}

export function closePane(tabId: string, paneId: string) {
  const tabs = tabsAtom.get();
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) {
    return;
  }

  if (tab.locked) {
    return;
  }

  // Clean up any DOM element with the pane's ID (e.g., webview elements)
  const paneElement = document.getElementById(paneId);
  if (paneElement) {
    paneElement.remove();

    // See whether this pane has an associated dev tools pane,
    // and if so, let's close it as well
    const devToolsPanes = Object.values(tab.panes).filter(
      (pane) => pane.type === "browser" && pane.devToolsFor === paneId,
    );

    for (const devToolsPane of devToolsPanes) {
      closePane(tabId, devToolsPane.id);
    }
  }

  // If this is the only pane in the tab, close the entire tab
  if (Object.keys(tab.panes).length === 1) {
    closeTab(tabId);
    return;
  }

  // Otherwise, just remove the pane
  removePane(tabId, paneId);
}
