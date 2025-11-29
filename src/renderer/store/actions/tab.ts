import type { PaneDescriptor } from "@/components/layout/quick/QuickDialog";
import {
  detachPane,
  removePane,
  updatePaneProperty,
} from "@/store/actions/pane";
import { activeTabAtom, activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type {
  EditorPane,
  LayoutNode,
  Pane,
  Tab,
  TerminalPane,
  WebViewPane,
} from "@/types";
import { generateId } from "@/utils/id";
import type { AgentSessionInfo, NewTabOptions, Workspace } from "@shared/types";
import { getDefaultStore } from "jotai";
import path from "path-browserify";
import { openWorkspace } from "./workspace";

const api = window.conduit;
const store = getDefaultStore();

/**
 * Get the current working directory from a tab's active pane
 * @param tab - The tab to get the CWD from
 * @param fallback - Fallback value if no CWD is found
 * @returns The CWD from the active pane, or the fallback
 */
export function getActiveTabCwd(
  tab: Tab | null | undefined,
  fallback = "",
): string {
  if (!tab) {
    return fallback;
  }

  const activePane = tab.panes[tab.activePaneId];
  if (activePane?.type === "terminal" || activePane?.type === "editor") {
    return activePane.cwd ?? fallback;
  }

  return fallback;
}

/**
 * Generate an incremented title for a duplicated tab
 * @param baseTitle - The title of the source tab
 * @param existingTabs - Array of existing tabs to check for conflicts
 * @returns A new title with an incremented number suffix, or undefined if no baseTitle
 */
export function generateIncrementedTabTitle(
  baseTitle: string | undefined,
  existingTabs: Tab[],
): string | undefined {
  if (!baseTitle) {
    return undefined;
  }

  // Extract number suffix if present (e.g., "My Tab 2" -> "My Tab", 2)
  const match = baseTitle.match(/^(.+?)\s+(\d+)$/);
  const baseName = match ? match[1] : baseTitle;
  const currentNumber = match ? parseInt(match[2], 10) : 1;

  // Find the highest number used by existing tabs with the same base name
  let highestNumber = currentNumber;
  for (const tab of existingTabs) {
    if (tab.title) {
      const tabMatch = tab.title.match(/^(.+?)\s+(\d+)$/);
      const tabBaseName = tabMatch ? tabMatch[1] : tab.title;
      const tabNumber = tabMatch ? parseInt(tabMatch[2], 10) : 1;

      if (tabBaseName === baseName && tabNumber >= highestNumber) {
        highestNumber = tabNumber + 1;
      }
    }
  }

  return `${baseName} ${highestNumber}`;
}

export async function openTab(
  options?: NewTabOptions,
): Promise<{ tabId: string; paneId: string; sessionId: string } | null> {
  // Inherit CWD from the active tab's active pane
  const activeTab = store.get(activeTabAtom);
  const cwd = getActiveTabCwd(activeTab);

  const result = await api.createTerminal(cwd ? { cwd } : undefined);
  if (!result) {
    return null;
  }

  const paneId = generateId();
  const tabId = generateId();

  const paneState: Pane = {
    id: paneId,
    type: "terminal",
    sessionId: result.sessionId,
    cwd: result.cwd ?? null,
    processTitle: result.title,
  };

  const layout: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId,
  };

  store.set(tabsAtom, (current) => [
    ...current,
    {
      id: tabId,
      panes: { [paneId]: paneState },
      layout,
      activePaneId: paneId,
      title: options?.title,
    },
  ]);
  focusTab(tabId);

  const command = options?.command;
  if (command && command.length > 0) {
    const commandWithNewline =
      command.endsWith("\n") || command.endsWith("\r")
        ? command
        : `${command}\n`;

    api.sendKeypress(result.sessionId, commandWithNewline);
  }

  return { tabId, paneId, sessionId: result.sessionId };
}

// Helper function to create a tab with a pane
function createTabWithPane(paneState: Pane): { tabId: string; paneId: string } {
  const tabId = generateId();

  const layout: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: paneState.id,
  };

  store.set(tabsAtom, (current) => [
    ...current,
    {
      id: tabId,
      panes: { [paneState.id]: paneState },
      layout,
      activePaneId: paneState.id,
    },
  ]);
  focusTab(tabId);

  return { tabId, paneId: paneState.id };
}

export function openTabFromExistingSession({
  sessionId,
  cwd,
  title,
  vmMetadata,
}: {
  sessionId: string;
  cwd?: string | null;
  title?: string | null;
  vmMetadata?: TerminalPane["vmMetadata"] | null;
}): { tabId: string; paneId: string } {
  const paneId = generateId();

  const paneState: Pane = {
    id: paneId,
    type: "terminal",
    sessionId,
    cwd: cwd ?? null,
    processTitle: title ?? "Terminal",
    vmMetadata: vmMetadata ?? undefined,
  };

  return createTabWithPane(paneState);
}

export async function openTabFromExistingAgentSession(
  session: AgentSessionInfo,
): Promise<{ tabId: string; paneId: string; sessionId: string } | null> {
  // Create a new terminal session in the worktree
  const result = await api.createTerminal({ cwd: session.worktreePath });
  if (!result) {
    return null;
  }

  const paneId = generateId();

  const paneState: Pane = {
    id: paneId,
    type: "terminal",
    sessionId: result.sessionId,
    cwd: result.cwd ?? session.worktreePath,
    processTitle: result.title ?? session.branchName,
    agentSessionId: session.id,
    agentBranchName: session.branchName,
    agentBaseBranch: session.baseBranch ?? undefined,
    agentRepoRoot: session.repoRoot,
    agentWorktreePath: session.worktreePath,
  };

  const { tabId } = createTabWithPane(paneState);

  return { tabId, paneId, sessionId: result.sessionId };
}

export async function openTabFromPaneDescriptor(
  descriptor: PaneDescriptor,
): Promise<{ tabId: string; paneId: string } | null> {
  const paneId = generateId();

  let paneState: Pane | null = null;

  if (descriptor.type === "terminal") {
    const terminalDescriptor = descriptor as Omit<TerminalPane, "id">;
    paneState = {
      id: paneId,
      type: "terminal",
      sessionId: terminalDescriptor.sessionId,
      cwd: terminalDescriptor.cwd,
      processTitle: terminalDescriptor.processTitle,
      vmMetadata: terminalDescriptor.vmMetadata,
    };
  } else if (descriptor.type === "editor") {
    const editorDescriptor = descriptor as Omit<EditorPane, "id">;
    paneState = {
      id: paneId,
      type: "editor",
      cwd: editorDescriptor.cwd,
      filePath: editorDescriptor.filePath,
      agentSessionId: editorDescriptor.agentSessionId,
      agentBranchName: editorDescriptor.agentBranchName,
      agentBaseBranch: editorDescriptor.agentBaseBranch,
      agentRepoRoot: editorDescriptor.agentRepoRoot,
      agentWorktreePath: editorDescriptor.agentWorktreePath,
    };
  } else if (descriptor.type === "webview") {
    const webviewDescriptor = descriptor as Omit<WebViewPane, "id">;
    paneState = {
      id: paneId,
      type: "webview",
      url: webviewDescriptor.url,
      title: webviewDescriptor.title,
    };
  }

  if (!paneState) {
    return null;
  }

  return createTabWithPane(paneState);
}

export function updateTabProperty(tabId: string, updates: Partial<Tab>) {
  store.set(tabsAtom, (current) =>
    current.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      const entries = Object.entries(updates);
      if (entries.length === 0) {
        return tab;
      }

      const updatedTab: Tab = { ...tab };
      let changed = false;

      entries.forEach(([key, value]) => {
        const currentValue = (updatedTab as Record<string, unknown>)[
          key as string
        ];
        if (!Object.is(currentValue, value)) {
          (updatedTab as Record<string, unknown>)[key as string] =
            value as unknown;
          changed = true;
        }
      });

      return changed ? updatedTab : tab;
    }),
  );
}

export function focusTab(tabId: string) {
  const tabs = store.get(tabsAtom);
  if (!tabs.some((tab) => tab.id === tabId)) {
    return;
  }

  store.set(activeTabIdAtom, tabId);
}

export function lockTab(tabId: string) {
  updateTabProperty(tabId, { locked: true });
}

export function unlockTab(tabId: string) {
  updateTabProperty(tabId, { locked: false });
}

type CloseTabOptions = {
  force?: boolean;
};

export function closeTab(tabId: string, options: CloseTabOptions = {}) {
  const { force = false } = options;
  const targetTab = store.get(tabsAtom).find((tab) => tab.id === tabId);
  if (!targetTab || (targetTab.locked && !force)) {
    return;
  }

  const sessionsToClose: string[] = [];
  const paneIdsToCleanup: string[] = [];
  let shouldOpenReplacement = false;
  const previousActiveTabId = store.get(activeTabIdAtom);
  let nextActiveTabId: string | null | undefined = undefined;

  store.set(tabsAtom, (current) => {
    const next: Tab[] = [];
    let removedTabIndex = -1;

    current.forEach((tab, index) => {
      if (tab.id === tabId) {
        removedTabIndex = index;
        Object.values(tab.panes).forEach((pane) => {
          // Collect pane IDs for DOM cleanup
          paneIdsToCleanup.push(pane.id);

          if (pane.type === "terminal") {
            sessionsToClose.push(pane.sessionId);
          }
        });
        return;
      }

      next.push(tab);
    });

    if (removedTabIndex === -1) {
      return current;
    }

    if (next.length === 0) {
      shouldOpenReplacement = true;
      nextActiveTabId = null;
      return [];
    }

    if (previousActiveTabId === tabId) {
      const targetIndex =
        removedTabIndex >= next.length ? next.length - 1 : removedTabIndex;
      nextActiveTabId = next[targetIndex]?.id ?? null;
    }

    return next;
  });

  if (nextActiveTabId !== undefined) {
    store.set(activeTabIdAtom, nextActiveTabId);
  }

  // Clean up DOM elements for all panes
  paneIdsToCleanup.forEach((paneId) => {
    const paneElement = document.getElementById(paneId);
    if (paneElement) {
      paneElement.remove();
    }
  });

  sessionsToClose.forEach((sessionId) => api.closeTerminal(sessionId));

  if (shouldOpenReplacement) {
    openTab();
  }
}

export function moveTab(tabId: string, targetIndex: number) {
  store.set(tabsAtom, (current) => {
    const fromIndex = current.findIndex((tab) => tab.id === tabId);
    if (fromIndex === -1) {
      return current;
    }

    const reorderedTabs = [...current];
    const [tab] = reorderedTabs.splice(fromIndex, 1);
    const boundedIndex = Math.max(
      0,
      Math.min(targetIndex, reorderedTabs.length),
    );
    reorderedTabs.splice(boundedIndex, 0, tab);
    return reorderedTabs;
  });
}

export function movePaneToTab(
  tabId: string,
  paneId: string,
): { tabId: string; paneId: string } | null {
  const tabs = store.get(tabsAtom);
  const sourceTab = tabs.find((tab) => tab.id === tabId);
  if (!sourceTab || sourceTab.locked) {
    return null;
  }

  const pane = sourceTab.panes[paneId];
  if (!pane) {
    return null;
  }

  const detachResult = detachPane(tabId, paneId);
  if (!detachResult) {
    return null;
  }

  const paneState: Pane = { ...detachResult.pane };
  const newTabId = generateId();
  const layout: LayoutNode = {
    id: generateId(),
    type: "pane",
    paneId: paneState.id,
  };

  const newTab: Tab = {
    id: newTabId,
    panes: {
      [paneState.id]: paneState,
    },
    layout,
    activePaneId: paneState.id,
  };

  store.set(tabsAtom, (current) => [...current, newTab]);
  store.set(activeTabIdAtom, newTabId);

  return { tabId: newTabId, paneId: paneState.id };
}

/**
 * Duplicate a tab with all its panes and layout
 */
type DuplicateTabOptions = {
  cwd?: string;
  title?: string;
  agentSession?: AgentSessionInfo;
};

export async function duplicateTab(
  sourceTabId: string,
  options?: DuplicateTabOptions,
): Promise<{ tabId: string } | null> {
  const tabs = store.get(tabsAtom);
  const sourceTab = tabs.find((tab) => tab.id === sourceTabId);
  if (!sourceTab) {
    return null;
  }

  // Map old pane IDs to new pane IDs
  const paneIdMap = new Map<string, string>();

  // Create new panes by duplicating the source panes
  const newPanes: Record<string, Pane> = {};
  for (const [oldPaneId, sourcePane] of Object.entries(sourceTab.panes)) {
    const newPaneId = generateId();
    paneIdMap.set(oldPaneId, newPaneId);

    if (sourcePane.type === "terminal") {
      // Capture command from source terminal before creating new one
      const capturedCommand = await api.captureTerminalCommand(
        sourcePane.sessionId,
      );

      // Create a new terminal session with the specified cwd or the source's cwd
      const cwdToUse = options?.cwd || sourcePane.cwd;
      const result = await api.createTerminal(
        cwdToUse ? { cwd: cwdToUse } : undefined,
      );
      if (!result) {
        continue;
      }

      // Use agent session from options if provided, otherwise preserve from source
      const agentSessionId =
        options?.agentSession?.id ?? sourcePane.agentSessionId;
      const agentBranchName =
        options?.agentSession?.branchName ?? sourcePane.agentBranchName;
      const agentBaseBranch =
        options?.agentSession?.baseBranch ?? sourcePane.agentBaseBranch;
      const agentRepoRoot =
        options?.agentSession?.repoRoot ?? sourcePane.agentRepoRoot;
      const agentWorktreePath =
        options?.agentSession?.worktreePath ?? sourcePane.agentWorktreePath;

      newPanes[newPaneId] = {
        id: newPaneId,
        type: "terminal",
        sessionId: result.sessionId,
        cwd: result.cwd ?? null,
        processTitle: result.title,
        vmMetadata: result.vmMetadata,
        agentSessionId,
        agentBranchName,
        agentBaseBranch,
        agentRepoRoot,
        agentWorktreePath,
      };

      // Auto-execute the captured command in the new terminal
      if (capturedCommand && capturedCommand.trim().length > 0) {
        const commandWithNewline = capturedCommand.endsWith("\n")
          ? capturedCommand
          : `${capturedCommand}\n`;
        api.sendKeypress(result.sessionId, commandWithNewline);
      }
    } else if (sourcePane.type === "editor") {
      // Translate file path if duplicating into a worktree
      let translatedFilePath = sourcePane.filePath;
      if (
        options?.agentSession &&
        sourcePane.filePath &&
        options.agentSession.repoRoot &&
        options.agentSession.worktreePath
      ) {
        // Normalize paths for comparison
        const normalizedFilePath = path.normalize(sourcePane.filePath);
        const normalizedRepoRoot = path.normalize(
          options.agentSession.repoRoot,
        );

        // Check if file is within the repository
        if (normalizedFilePath.startsWith(normalizedRepoRoot + path.sep)) {
          // Get the relative path from repo root
          const relativePath = path.relative(
            normalizedRepoRoot,
            normalizedFilePath,
          );
          // Construct the new path in the worktree
          translatedFilePath = path.join(
            options.agentSession.worktreePath,
            relativePath,
          );
        }
      }

      // Use agent session from options if provided, otherwise preserve from source
      const agentSessionId =
        options?.agentSession?.id ?? sourcePane.agentSessionId;
      const agentBranchName =
        options?.agentSession?.branchName ?? sourcePane.agentBranchName;
      const agentBaseBranch =
        options?.agentSession?.baseBranch ?? sourcePane.agentBaseBranch;
      const agentRepoRoot =
        options?.agentSession?.repoRoot ?? sourcePane.agentRepoRoot;
      const agentWorktreePath =
        options?.agentSession?.worktreePath ?? sourcePane.agentWorktreePath;

      newPanes[newPaneId] = {
        id: newPaneId,
        type: "editor",
        cwd: options?.cwd || sourcePane.cwd,
        filePath: translatedFilePath,
        agentSessionId,
        agentBranchName,
        agentBaseBranch,
        agentRepoRoot,
        agentWorktreePath,
      };
    } else if (sourcePane.type === "webview") {
      newPanes[newPaneId] = {
        id: newPaneId,
        type: "webview",
        url: sourcePane.url,
        title: sourcePane.title,
      };
    }
  }

  // Clone the layout tree, replacing old pane IDs with new ones
  const cloneLayoutNode = (node: LayoutNode): LayoutNode => {
    if (node.type === "pane") {
      const newPaneId = paneIdMap.get(node.paneId);
      if (!newPaneId) {
        // This shouldn't happen, but return the original if mapping is missing
        return node;
      }
      return {
        id: generateId(),
        type: "pane",
        paneId: newPaneId,
        size: node.size,
      };
    }

    // Split node - recursively clone children
    return {
      id: generateId(),
      type: "split",
      direction: node.direction,
      children: node.children.map(cloneLayoutNode),
      size: node.size,
    };
  };

  const newLayout = cloneLayoutNode(sourceTab.layout);

  // Use provided title or generate one
  const newTitle =
    options?.title || generateIncrementedTabTitle(sourceTab.title, tabs);

  // Map the active pane ID
  const newActivePaneId = paneIdMap.get(sourceTab.activePaneId);
  if (!newActivePaneId) {
    // Fallback to first pane if mapping fails
    const firstPaneId = Object.keys(newPanes)[0];
    if (!firstPaneId) {
      return null;
    }
  }

  // Create the new tab
  const newTabId = generateId();
  const newTab: Tab = {
    id: newTabId,
    panes: newPanes,
    layout: newLayout,
    activePaneId: newActivePaneId || Object.keys(newPanes)[0],
    title: newTitle,
    locked: sourceTab.locked,
    synchronized: sourceTab.synchronized,
  };

  // Insert the new tab immediately after the source tab
  store.set(tabsAtom, (current) => {
    const sourceIndex = current.findIndex((tab) => tab.id === sourceTabId);
    if (sourceIndex === -1) {
      return [...current, newTab];
    }

    const newTabs = [...current];
    newTabs.splice(sourceIndex + 1, 0, newTab);
    return newTabs;
  });

  // Activate the new tab
  focusTab(newTabId);

  return { tabId: newTabId };
}

/**
 * Duplicate a tab into a new git worktree
 * Creates an isolated worktree and duplicates the tab with all panes into that worktree
 * @throws Error if no working directory is found or not in a git repository
 */
export async function duplicateTabIntoWorktree(
  sourceTabId: string,
  options?: { title?: string },
): Promise<{ tabId: string; sessionId: string; branchName: string } | null> {
  const tabs = store.get(tabsAtom);
  const sourceTab = tabs.find((tab) => tab.id === sourceTabId);
  if (!sourceTab) {
    return null;
  }

  // Get the CWD from the source tab
  const cwd = getActiveTabCwd(sourceTab);
  if (!cwd) {
    throw new Error(
      "Cannot create worktree: No working directory found in active pane",
    );
  }

  // Check if the directory is in a git repository
  const hasGitRepo = await api.hasGitRepository(cwd);
  if (!hasGitRepo) {
    throw new Error(
      "Cannot create worktree: Current directory is not in a git repository",
    );
  }

  // Create a new agent session (worktree)
  const session = await api.spawnAgentSession({ cwd });

  // Duplicate the tab with the worktree path as CWD and agent session metadata
  const result = await duplicateTab(sourceTabId, {
    cwd: session.worktreePath,
    title: options?.title,
    agentSession: session,
  });

  if (!result) {
    throw new Error("Failed to duplicate tab into worktree");
  }

  return {
    tabId: result.tabId,
    sessionId: session.id,
    branchName: session.branchName,
  };
}

export function registerTabEventHandlers() {
  const unsubscribeExit = api.onExit(({ sessionId }) => {
    const tabs = store.get(tabsAtom);

    for (const tab of tabs) {
      const targetPane = Object.values(tab.panes).find(
        (pane) => pane.type === "terminal" && pane.sessionId === sessionId,
      );
      if (targetPane) {
        const paneCount = Object.keys(tab.panes).length;
        if (paneCount <= 1) {
          closeTab(tab.id, { force: true });
        } else {
          removePane(tab.id, targetPane.id, { skipTerminalClose: true });
        }
        break;
      }
    }
  });

  const unsubscribeNewTab = api.onNewTabRequest(() => {
    void openTab();
  });

  const unsubscribeOpenWorkspace = api.onOpenWorkspaceRequest(
    (workspace: Workspace) => openWorkspace(workspace),
  );

  return () => {
    unsubscribeExit();
    unsubscribeNewTab();
    unsubscribeOpenWorkspace();
  };
}
