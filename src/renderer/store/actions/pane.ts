import { deleteCanvasState } from "@/store/canvasStore";
import { disposeEditorPane } from "@/components/panes/editor-v2";
import {
  pauseStateTracking,
  resumeStateTracking,
} from "@/components/panes/terminal/state/stateTracker";
import { disposeSession } from "@/components/panes/terminal/state/xtermCache";
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
  walkLayout,
  type PaneDirection,
} from "@/utils/layout";
import type {
  AgentSessionCleanupResult,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
  TerminalCreateOptions,
} from "@shared/types";
import { generateId } from "@shared/utils";
import { getDefaultStore } from "jotai";

const api = window.conduit;
const store = getDefaultStore();

// Internal utilities

/**
 * Check whether a specific layout node contains a pane.
 * @param node The layout node to check.
 * @param paneId The ID of the pane to look for.
 * @returns True if the pane is found, false otherwise.
 */
function containsPane(node: LayoutNode, paneId: string): boolean {
  let found = false;
  walkLayout(node, ({ node: current }) => {
    if (current.type === "pane" && current.paneId === paneId) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Check whether a pane is collapsed in a tab's layout.
 */
export function isPaneCollapsed(tab: Tab, paneId: string): boolean {
  let collapsed = false;
  walkLayout(tab.layout, ({ node }) => {
    if (node.type === "pane" && node.paneId === paneId) {
      collapsed = !!node.collapsed;
      return false;
    }
    return true;
  });
  return collapsed;
}

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
    containsPane(child, targetPaneId),
  );
  if (childIndex === -1) {
    return { node, modified: false };
  }

  const targetChild = node.children[childIndex];

  if (
    node.direction === direction &&
    targetChild.type === "pane" &&
    targetChild.paneId === targetPaneId
  ) {
    const newChildren = [...node.children];
    newChildren.splice(insertBefore ? childIndex : childIndex + 1, 0, newNode);
    return {
      node: {
        ...node,
        children: newChildren,
      },
      modified: true,
    };
  }

  const { node: updatedChild, modified } = splitLayoutNode(
    targetChild,
    targetPaneId,
    direction,
    newNode,
    insertBefore,
  );
  if (modified) {
    const newChildren = [...node.children];
    newChildren[childIndex] = updatedChild;
    return {
      node: {
        ...node,
        children: newChildren,
      },
      modified: true,
    };
  }

  if (targetChild.type === "pane" && targetChild.paneId === targetPaneId) {
    const newChildren = [...node.children];
    newChildren[childIndex] = {
      id: generateId(),
      type: "split",
      direction,
      children: insertBefore ? [newNode, targetChild] : [targetChild, newNode],
    };
    return {
      node: {
        ...node,
        children: newChildren,
      },
      modified: true,
    };
  }

  return { node, modified: false };
}

function removePaneFromLayoutNode(
  node: LayoutNode,
  targetPaneId: string,
): { node: LayoutNode | null; removed: boolean } {
  const {
    node: updatedNode,
    removedPane,
    modified,
  } = extractPaneNode(node, targetPaneId);

  if (!modified || !removedPane) {
    return { node, removed: false };
  }

  return {
    node: updatedNode,
    removed: true,
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

  // Pause/resume idle tracking for terminal panes when collapsing/expanding
  const tabs = store.get(tabsAtom);
  const tab = tabs.find(({ id }) => id === tabId);
  const pane = tab?.panes[paneId];
  if (pane?.type === "terminal") {
    if (collapsed) {
      pauseStateTracking(pane.sessionId);
    } else {
      resumeStateTracking(pane.sessionId);
    }
  }

  store.set(tabsAtom, (tabs) => {
    // Find the layout node for the pane and update its collapsed state
    const tab = tabs.find(({ id }) => id === tabId);
    walkLayout(tab.layout, ({ node, parent }) => {
      if (node.type === "pane" && node.paneId === paneId) {
        if (collapsed) {
          node.collapsed = true;

          if (tab.activePaneId === paneId) {
            // If the pane being minimized is then active
            // pane, then let's find its first non-minimized
            // sibling, and make that the active pane instead.
            const siblingPaneId = parent.children
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
  });
}

type ExtractPaneResult = {
  node: LayoutNode | null;
  removedPane: LayoutPaneNode | null;
  modified: boolean;
};

function extractPaneNode(node: LayoutNode, paneId: string): ExtractPaneResult {
  if (node.type === "pane") {
    if (node.paneId === paneId) {
      return { node: null, removedPane: node, modified: true };
    }

    return { node, removedPane: null, modified: false };
  }

  let modified = false;
  let removedPane: LayoutPaneNode | null = null;
  const newChildren: LayoutNode[] = [];

  node.children.forEach((child) => {
    if (removedPane) {
      newChildren.push(child);
      return;
    }

    const result = extractPaneNode(child, paneId);
    if (result.modified) {
      modified = true;
    }
    if (!removedPane && result.removedPane) {
      removedPane = result.removedPane;
    }
    if (result.node) {
      newChildren.push(result.node);
    }
  });

  if (!modified || !removedPane) {
    return { node, removedPane: null, modified: false };
  }

  if (newChildren.length === 0) {
    return { node: null, removedPane, modified: true };
  }

  if (newChildren.length === 1) {
    const soleChild = newChildren[0];
    return { node: soleChild, removedPane, modified: true };
  }

  if (
    newChildren.length === node.children.length &&
    newChildren.every((child, idx) => child === node.children[idx])
  ) {
    return { node, removedPane, modified: true };
  }

  return {
    node: {
      ...node,
      children: newChildren,
    },
    removedPane,
    modified: true,
  };
}

export function updatePaneProperty<T extends Pane>(
  tabId: string,
  paneId: string,
  updates: Partial<T>,
) {
  store.set(tabsAtom, (tabs) => {
    const tab = tabs.find(({ id }) => id === tabId);
    const pane = tab?.panes[paneId];
    if (!pane) return;

    Object.assign(pane, updates);
  });
}

export function updateTerminalSessionProperty(
  sessionId: string,
  updates: Partial<TerminalPane>,
) {
  store.set(tabsAtom, (tabs) => {
    for (const tab of tabs) {
      for (const pane of Object.values(tab.panes)) {
        if (pane.type === "terminal" && pane.sessionId === sessionId) {
          Object.assign(pane, updates);
        }
      }
    }
  });
}

export function movePane(
  tabId: string,
  paneId: string,
  direction: PaneDirection,
) {
  store.set(tabsAtom, (current) =>
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
        (candidate) => candidate.type === "pane" && candidate.paneId === paneId,
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
        if (!detachResult.modified || !detachResult.removedPane) {
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

        const insertIndex = isForward ? neighborPosition + 1 : neighborPosition;
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
  const tabs = store.get(tabsAtom);
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
  const previousActiveTabId = store.get(activeTabIdAtom);
  let removedTabWasActive = false;
  let nextActiveTabId: string | null | undefined = undefined;

  store.set(tabsAtom, (current) => {
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

      const { node: newLayout, removed } = removePaneFromLayoutNode(
        tab.layout,
        paneId,
      );

      if (!removed) {
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
            removedTabIndex >= next.length ? next.length - 1 : removedTabIndex;
          nextActiveTabId = next[targetIndex]?.id ?? null;
        } else {
          nextActiveTabId = null;
        }
      } else if (next.length === 0) {
        nextActiveTabId = null;
      }
    }

    return next;
  });

  if (nextActiveTabId !== undefined) {
    store.set(activeTabIdAtom, nextActiveTabId);
  }

  if (!detachedPane) {
    return null;
  }

  return { pane: detachedPane, tabClosed };
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
  const tabs = store.get(tabsAtom);
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

  const sourceTerminalPane =
    sourcePane.type === "terminal" ? sourcePane : undefined;

  const defaultCwd = sourceTerminalPane?.cwd ?? undefined;

  const requestOptions = options.terminalOptions
    ? { ...options.terminalOptions }
    : defaultCwd
      ? { cwd: defaultCwd }
      : undefined;

  const agentSessionId =
    options.agentSession?.id ?? sourceTerminalPane?.agentSessionId;
  const agentBranchName =
    options.agentSession?.branchName ?? sourceTerminalPane?.agentBranchName;
  const agentBaseBranch =
    options.agentSession?.baseBranch ?? sourceTerminalPane?.agentBaseBranch;
  const agentRepoRoot =
    options.agentSession?.repoRoot ?? sourceTerminalPane?.agentRepoRoot;
  const agentWorktreePath =
    options.agentSession?.worktreePath ?? sourceTerminalPane?.agentWorktreePath;

  const result = await api.createTerminal(requestOptions);
  if (!result) {
    return;
  }

  const newPaneId = generateId();
  const newPaneState: Pane = {
    id: newPaneId,
    type: "terminal",
    sessionId: result.sessionId,
    cwd: result.cwd ?? null,
    processTitle: result.title,
    sandboxId: result.sandboxId,
    agentSessionId,
    agentBranchName,
    agentBaseBranch,
    agentRepoRoot,
    agentWorktreePath,
  };

  const newLayoutNode: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: newPaneId,
  };

  store.set(tabsAtom, (current) =>
    current.map((currentTab) => {
      if (currentTab.id !== tabId) {
        return currentTab;
      }

      const { node: newLayout, modified } = splitLayoutNode(
        currentTab.layout,
        paneId,
        direction,
        newLayoutNode,
        insertBefore,
      );

      if (!modified) {
        return currentTab;
      }

      return {
        ...currentTab,
        panes: {
          ...currentTab.panes,
          [newPaneId]: newPaneState,
        },
        layout: newLayout,
        activePaneId: newPaneId,
      };
    }),
  );

  return newPaneState;
}

/**
 * Create a new terminal pane at the root level of the tab layout.
 * This wraps the entire existing layout in a new split, creating a
 * full-width or full-height pane alongside all existing content.
 */
export async function splitTabLayoutAtRoot(
  tabId: string,
  direction: SplitDirection,
  insertBefore = false,
  options: SplitPaneOptions = {},
) {
  const tabs = store.get(tabsAtom);
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) {
    return;
  }

  if (tab.locked) {
    return;
  }

  // Get cwd from active pane if it's a terminal
  const activePane = tab.panes[tab.activePaneId];
  const defaultCwd =
    activePane?.type === "terminal" ? (activePane.cwd ?? undefined) : undefined;

  const requestOptions = options.terminalOptions
    ? { ...options.terminalOptions }
    : defaultCwd
      ? { cwd: defaultCwd }
      : undefined;

  const result = await api.createTerminal(requestOptions);
  if (!result) {
    return;
  }

  const newPaneId = generateId();
  const newPaneState: Pane = {
    id: newPaneId,
    type: "terminal",
    sessionId: result.sessionId,
    cwd: result.cwd ?? null,
    processTitle: result.title,
    sandboxId: result.sandboxId,
  };

  const newLayoutNode: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: newPaneId,
  };

  store.set(tabsAtom, (current) =>
    current.map((currentTab) => {
      if (currentTab.id !== tabId) {
        return currentTab;
      }

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
          [newPaneId]: newPaneState,
        },
        layout: newLayout,
        activePaneId: newPaneId,
      };
    }),
  );

  return newPaneState;
}

/**
 * Insert an existing pane at the root level of the tab layout.
 * Used by drag/drop to create full-width or full-height panes.
 */
export function insertPaneAtTabRoot(
  tabId: string,
  pane: Pane,
  direction: SplitDirection,
  insertBefore = false,
) {
  store.set(tabsAtom, (current) =>
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
  );
}

export async function splitPaneWithAgentSession(
  tabId: string,
  paneId: string,
  direction: SplitDirection,
  insertBefore = false,
) {
  const tabs = store.get(tabsAtom);
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
    sourcePane.type === "terminal" ? (sourcePane.cwd ?? undefined) : undefined;

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

  const newLayoutNode: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: newPaneId,
  };

  store.set(tabsAtom, (current) =>
    current.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      const { node: newLayout, modified } = splitLayoutNode(
        tab.layout,
        paneId,
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
          [newPaneId]: newPaneState,
        },
        layout: newLayout,
        activePaneId: newPaneId,
      };
    }),
  );
}

type OpenEditorPaneOptions = {
  file?: string;
  preview?: boolean;
  sandboxId?: string;
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
    sandboxId: options.sandboxId,
  };

  const newLayoutNode: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: newPaneId,
  };

  store.set(tabsAtom, (current) =>
    current.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      const { node: newLayout, modified } = splitLayoutNode(
        tab.layout,
        paneId,
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
          [newPaneId]: newPaneState,
        },
        layout: newLayout,
        activePaneId: newPaneId,
      };
    }),
  );

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

  const newLayoutNode: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: newPaneId,
  };

  store.set(tabsAtom, (current) =>
    current.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      const { node: newLayout, modified } = splitLayoutNode(
        tab.layout,
        paneId,
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
          [newPaneId]: newPaneState,
        },
        layout: newLayout,
        activePaneId: newPaneId,
      };
    }),
  );

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
  // can be cloned. So we're not repeating those checks here. That said,
  store.set(tabsAtom, (tabs) => {
    const tab = tabs.find(({ id }) => id === tabId);
    const sourcePane = tab.panes[paneId] as TerminalPane;

    const newPaneId = generateId();
    const newPane: TerminalPane = {
      ...sourcePane,
      id: newPaneId,
      cloneOf: sourcePane.cloneOf ?? paneId,
    };

    const newLayoutNode: LayoutNode = {
      id: generateId(),
      type: "pane",
      paneId: newPaneId,
    };

    const { node: newLayout } = splitLayoutNode(
      tab.layout,
      paneId,
      direction,
      newLayoutNode,
      insertBefore,
    );

    tab.panes[newPaneId] = newPane;
    tab.layout = newLayout;
    tab.activePaneId = newPaneId;
  });
}

type RemovePaneOptions = {
  skipTerminalClose?: boolean;
};

export function removePane(
  tabId: string,
  paneId: string,
  options: RemovePaneOptions = {},
) {
  if (!api) {
    return;
  }

  store.set(tabsAtom, (current) =>
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

      const { node: newLayout, removed } = removePaneFromLayoutNode(
        tab.layout,
        paneId,
      );

      if (!removed || !newLayout) {
        return tab;
      }

      if (pane.type === "terminal") {
        // Check if there are other panes across all tabs sharing this session
        const allTabs = store.get(tabsAtom);
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
          api.closeTerminal(pane.sessionId);
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
  );
}

export function closeAgentSessionPanes(
  tabId: string,
  agentSessionId: string,
): number {
  const tabs = store.get(tabsAtom);
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
  if (!api) {
    return null;
  }

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
  if (!api) {
    return null;
  }

  const result = await api.cleanupAgentSession({ sessionId: agentSessionId });

  closeAgentSessionPanes(tabId, agentSessionId);

  return result;
}

export function activatePane(tabId: string, paneId: string) {
  store.set(tabsAtom, (tabs) => {
    const tab = tabs.find(({ id }) => id === tabId);
    if (!tab || tab.activePaneId === paneId) {
      return tabs;
    }

    tab.activePaneId = paneId;
  });
}

export function closePane(tabId: string, paneId: string) {
  const tabs = store.get(tabsAtom);
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

/**
 * Forward a port from a cloud VM and open it in a new web pane
 */
export async function forwardPortAndOpen(
  tabId: string,
  paneId: string,
  sandboxId: string,
  port: number,
): Promise<void> {
  try {
    // Show loading notification
    const notificationId = enqueueNotification({
      kind: "info",
      message: `Forwarding port ${port}...`,
      persistent: true,
    });

    // Call the VM API to forward the port
    const result = await api.forwardPort(sandboxId, port, `Port ${port}`);

    // Dismiss loading notification
    const { dismissNotification } = await import("./notifications");
    dismissNotification(notificationId);

    // Split the pane vertically and open the connection URL in a BrowserPane
    // openBrowserPane handles both splitting and creating the browser pane
    openBrowserPane(
      tabId,
      paneId,
      `http://${result.connection_url}`,
      "row",
      false,
    );

    // Show success notification
    enqueueNotification({
      kind: "success",
      message: `Port ${port} forwarded`,
      details: `Access at ${result.connection_url}`,
      autoCloseMs: 3000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    enqueueNotification({
      kind: "error",
      message: `Failed to forward port ${port}`,
      details: errorMessage,
      autoCloseMs: 5000,
    });
    console.error("Failed to forward port:", error);
    throw error;
  }
}
