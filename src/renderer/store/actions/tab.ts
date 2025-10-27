import {
  detachPane,
  removePane,
  updatePaneProperty,
} from "@/store/actions/pane";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { LayoutNode, Pane, Tab } from "@/types";
import { generateId } from "@/utils/id";
import type { Workspace } from "@shared/types";
import { getDefaultStore } from "jotai";
import { openWorkspace } from "./workspace";
import type { PaneDescriptor } from "@/components/shell/QuickPaneDialog";

const api = window.conduit;
const store = getDefaultStore();

export async function openTab(
  initialCommand?: string
): Promise<{ tabId: string; paneId: string; sessionId: string } | null> {
  const result = await api.createTerminal();
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
      mode: "layout",
    },
  ]);
  store.set(activeTabIdAtom, tabId);

  if (initialCommand && initialCommand.length > 0) {
    const commandWithNewline =
      initialCommand.endsWith("\n") || initialCommand.endsWith("\r")
        ? initialCommand
        : `${initialCommand}\n`;

    api.sendKeypress(result.sessionId, commandWithNewline);
  }

  return { tabId, paneId, sessionId: result.sessionId };
}

export function openTabFromExistingSession({
  sessionId,
  cwd,
  title,
}: {
  sessionId: string;
  cwd?: string | null;
  title?: string | null;
}): { tabId: string; paneId: string } {
  const paneId = generateId();
  const tabId = generateId();

  const paneState: Pane = {
    id: paneId,
    type: "terminal",
    sessionId,
    cwd: cwd ?? null,
    processTitle: title ?? "Terminal",
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
      mode: "layout",
    },
  ]);
  store.set(activeTabIdAtom, tabId);

  return { tabId, paneId };
}

export async function openTabFromPaneDescriptor(
  descriptor: PaneDescriptor
): Promise<{ tabId: string; paneId: string } | null> {
  const paneId = generateId();
  const tabId = generateId();

  let paneState: Pane | null = null;

  if (descriptor.type === "terminal") {
    paneState = {
      id: paneId,
      type: "terminal",
      sessionId: descriptor.sessionId,
      cwd: descriptor.cwd,
      processTitle: "Terminal",
    };
  } else if (descriptor.type === "editor") {
    paneState = {
      id: paneId,
      type: "editor",
      cwd: descriptor.cwd,
      filePath: descriptor.filePath,
    };
  } else if (descriptor.type === "webview") {
    paneState = {
      id: paneId,
      type: "webview",
      url: descriptor.url,
      title: descriptor.title,
    };
  }

  if (!paneState) {
    return null;
  }

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
      mode: "layout",
    },
  ]);
  store.set(activeTabIdAtom, tabId);

  return { tabId, paneId };
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
    })
  );
}

export function focusTab(tabId: string) {
  const tabs = store.get(tabsAtom);
  if (!tabs.some((tab) => tab.id === tabId)) {
    return;
  }

  store.set(activeTabIdAtom, tabId);
}

export function closeTab(tabId: string) {
  const sessionsToClose: string[] = [];
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
      Math.min(targetIndex, reorderedTabs.length)
    );
    reorderedTabs.splice(boundedIndex, 0, tab);
    return reorderedTabs;
  });
}

export function movePaneToTab(
  tabId: string,
  paneId: string
): { tabId: string; paneId: string } | null {
  const tabs = store.get(tabsAtom);
  const sourceTab = tabs.find((tab) => tab.id === tabId);
  if (!sourceTab) {
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
    mode: "layout",
  };

  store.set(tabsAtom, (current) => [...current, newTab]);
  store.set(activeTabIdAtom, newTabId);

  return { tabId: newTabId, paneId: paneState.id };
}

export function registerTabEventHandlers() {
  if (!api) {
    return () => { };
  }

  const unsubscribeTitle = api.onTitle(({ sessionId, title }) => {
    updatePaneProperty(sessionId, { processTitle: title });
  });

  const unsubscribeCwd = api.onCwd(({ sessionId, cwd }) => {
    updatePaneProperty(sessionId, { cwd });
  });

  const unsubscribeExit = api.onExit(({ sessionId }) => {
    const tabs = store.get(tabsAtom);

    for (const tab of tabs) {
      const targetPane = Object.values(tab.panes).find(
        (pane) => pane.type === "terminal" && pane.sessionId === sessionId
      );
      if (targetPane) {
        const paneCount = Object.keys(tab.panes).length;
        if (paneCount <= 1) {
          closeTab(tab.id);
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

  const unsubscribeOpenWorkspace = api.onOpenWorkspaceRequest((workspace: Workspace) =>
    openWorkspace(workspace)
  );

  return () => {
    unsubscribeTitle();
    unsubscribeCwd();
    unsubscribeExit();
    unsubscribeNewTab();
    unsubscribeOpenWorkspace();
  };
}
