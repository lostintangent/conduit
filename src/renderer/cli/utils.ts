import { browserAutomate } from "@/cli/browser";
import { sidebarPaneIds } from "@/components/shell/sidebar/utils";
import { isHyperTerminal } from "@/store/actions/hyperTerminal";
import type { SidebarView } from "@/store/atoms";
import type { Tab, TerminalPane } from "@/types";
import type { WebviewTag } from "electron";

export type CliRequestContext = {
  tabs: Tab[];
  sessionId: string;
  activeTab?: Tab;
};

/**
 * Extended context for operations that can fall back to sidebar views.
 * Used by both browser and canvas resolution logic.
 */
export type SidebarAwareContext = CliRequestContext & {
  isSidebarOpen: boolean;
  sidebarView: SidebarView;
  activeCwd: string;
};

export function findCallingTerminalTab({
  tabs,
  sessionId,
  activeTab,
}: CliRequestContext): Tab {
  let matchingTab = tabs.find((tab) =>
    Object.values(tab.panes).some(
      (pane) => pane.type === "terminal" && pane.sessionId === sessionId,
    ),
  );

  if (!matchingTab && isHyperTerminal(sessionId)) {
    matchingTab = activeTab ?? undefined;
  }

  if (!matchingTab) {
    throw new Error("Unable to find the calling terminal's tab.");
  }

  return matchingTab;
}

/**
 * Resolve a browser pane for CLI operations.
 *
 * Priority:
 * 1. If paneId is explicitly provided, use it
 * 2. If sidebar is open with browser view, use sidebar browser
 * 3. Look for a browser pane in the calling terminal's tab
 * 4. Throw if no browser found
 */
export function resolveBrowserPane(
  context: SidebarAwareContext,
  paneId?: string,
): { paneId: string; webview: WebviewTag } {
  const findBrowserPane = () => {
    // First, check if sidebar is open with browser view
    if (context.isSidebarOpen && context.sidebarView === "browser") {
      return sidebarPaneIds.browser();
    }

    // Fall back to checking for a browser pane in the tab
    const matchingTab = findCallingTerminalTab(context);

    const browserPane = Object.entries(matchingTab.panes).find(
      ([, pane]) => pane.type === "browser",
    );

    if (!browserPane) {
      throw new Error("No browser pane found in the calling tab.");
    }

    return browserPane[0];
  };

  const resolvedPaneId = paneId ?? findBrowserPane();

  const webview = document.getElementById(resolvedPaneId) as WebviewTag | null;

  if (!webview) {
    throw new Error(`Browser pane ${resolvedPaneId} not found.`);
  }

  return { paneId: resolvedPaneId, webview };
}

export function resolveTerminalSessions(
  context: CliRequestContext,
  paneId?: string,
  all?: boolean,
): string[] {
  const { sessionId } = context;
  const matchingTab = findCallingTerminalTab(context);

  const getOtherTerminalPanes = () =>
    Object.entries(matchingTab.panes).filter(
      ([, pane]) => pane.type === "terminal" && pane.sessionId !== sessionId,
    ) as [string, TerminalPane][];

  const callerIsHyperTerminal = isHyperTerminal(sessionId);

  if (all || (callerIsHyperTerminal && !paneId)) {
    const terminalPanes = getOtherTerminalPanes();

    if (terminalPanes.length === 0) {
      throw new Error("No other terminals found in the tab.");
    }

    return terminalPanes.map(([, pane]) => pane.sessionId);
  }

  if (paneId) {
    const pane = matchingTab.panes[paneId];
    if (!pane || pane.type !== "terminal") {
      throw new Error(`Terminal pane ${paneId} not found.`);
    }

    return [pane.sessionId];
  }

  const terminalPanes = getOtherTerminalPanes();

  if (terminalPanes.length === 0) {
    throw new Error("No other terminals found in the tab.");
  }

  return [terminalPanes[0][1].sessionId];
}

type BrowserAutomationCommand = Parameters<typeof browserAutomate>[0];

export async function automateBrowser<T extends BrowserAutomationCommand>(
  context: SidebarAwareContext,
  command: T,
  args: Parameters<typeof browserAutomate<T>>[1],
) {
  const { paneId } = resolveBrowserPane(context, args?.paneId);

  return browserAutomate(command, {
    ...args,
    paneId,
  } as Parameters<typeof browserAutomate<T>>[1]);
}

export function resolveCanvasPane(
  context: SidebarAwareContext,
  paneId?: string,
): { paneId: string; canvas: HTMLCanvasElement } {
  const findCanvasPane = () => {
    // First, check if sidebar is open with canvas view
    if (context.isSidebarOpen && context.sidebarView === "canvas") {
      // Try global canvas first (if sidebar is locked, this is the active one)
      const globalId = sidebarPaneIds.canvas.global();
      const globalCanvas = document.getElementById(`canvas-${globalId}`);
      if (globalCanvas) {
        return globalId;
      }

      // Fall back to per-CWD canvas (unlocked mode)
      return sidebarPaneIds.canvas.forCwd(context.activeCwd);
    }

    // Fall back to checking for a canvas pane in the tab
    const matchingTab = findCallingTerminalTab(context);

    const canvasPane = Object.entries(matchingTab.panes).find(
      ([, pane]) => pane.type === "canvas",
    );

    if (!canvasPane) {
      throw new Error("No canvas pane found in the calling tab.");
    }

    return canvasPane[0];
  };

  const resolvedPaneId = paneId ?? findCanvasPane();

  const canvas = document.getElementById(
    `canvas-${resolvedPaneId}`,
  ) as HTMLCanvasElement | null;

  if (!canvas) {
    throw new Error(`Canvas pane ${resolvedPaneId} not found.`);
  }

  return { paneId: resolvedPaneId, canvas };
}
