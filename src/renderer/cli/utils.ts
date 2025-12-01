import { browserAutomate } from "@/cli/browser";
import type { Tab, TerminalPane } from "@/types";
import type { WebviewTag } from "electron";

type CliResponders = {
  respondResult: (result?: unknown) => void;
  respondError: (message: string) => void;
};

export type PaneResolutionContext = CliResponders & {
  tabs: Tab[];
  sessionId: string;
  activeTab?: Tab;
  floatingTerminal?: { terminalId: string };
};

export function findCallingTerminalTab({
  tabs,
  sessionId,
  floatingTerminal,
  activeTab,
}: PaneResolutionContext): Tab | null {
  let matchingTab = tabs.find((tab) =>
    Object.values(tab.panes).some(
      (pane) => pane.type === "terminal" && pane.sessionId === sessionId,
    ),
  );

  if (!matchingTab && floatingTerminal?.terminalId === sessionId) {
    matchingTab = activeTab ?? null;
  }

  return matchingTab ?? null;
}

export function resolveBrowserPane(
  context: PaneResolutionContext,
  paneId?: string,
): { paneId: string; webview: WebviewTag } | null {
  const findBrowserPane = () => {
    const matchingTab = findCallingTerminalTab(context);

    if (!matchingTab) {
      context.respondError("Unable to find the calling terminal's tab.");
      return null;
    }

    const browserPane = Object.entries(matchingTab.panes).find(
      ([, pane]) => pane.type === "webview",
    );

    if (!browserPane) {
      context.respondError("No browser pane found in the calling tab.");
      return null;
    }

    return browserPane[0];
  };

  const resolvedPaneId = paneId ?? findBrowserPane();

  if (!resolvedPaneId) {
    return null;
  }

  const webview = document.getElementById(resolvedPaneId) as WebviewTag | null;

  if (!webview) {
    context.respondError(`Browser pane ${resolvedPaneId} not found.`);
    return null;
  }

  return { paneId: resolvedPaneId, webview } as const;
}

export function resolveTerminalSessions(
  context: PaneResolutionContext,
  paneId?: string,
  all?: boolean,
): string[] | null {
  const { sessionId, floatingTerminal } = context;
  const matchingTab = findCallingTerminalTab(context);

  if (!matchingTab) {
    context.respondError("Unable to find the calling terminal's tab.");
    return null;
  }

  const getOtherTerminalPanes = () =>
    Object.entries(matchingTab.panes).filter(
      ([, pane]) => pane.type === "terminal" && pane.sessionId !== sessionId,
    ) as [string, TerminalPane][];

  const isFloatingTerminal = floatingTerminal?.terminalId === sessionId;

  if (all || (isFloatingTerminal && !paneId)) {
    const terminalPanes = getOtherTerminalPanes();

    if (terminalPanes.length === 0) {
      context.respondError("No other terminals found in the tab.");
      return null;
    }

    return terminalPanes.map(([, pane]) => pane.sessionId);
  }

  if (paneId) {
    const pane = matchingTab.panes[paneId];
    if (!pane || pane.type !== "terminal") {
      context.respondError(`Terminal pane ${paneId} not found.`);
      return null;
    }

    return [pane.sessionId];
  }

  const terminalPanes = getOtherTerminalPanes();

  if (terminalPanes.length === 0) {
    context.respondError("No other terminals found in the tab.");
    return null;
  }

  return [terminalPanes[0][1].sessionId];
}

type BrowserAutomationCommand = Parameters<typeof browserAutomate>[0];

export async function automateBrowser<T extends BrowserAutomationCommand>(
  context: PaneResolutionContext,
  command: T,
  args: Parameters<typeof browserAutomate<T>>[1],
) {
  const resolvedPane = resolveBrowserPane(context, args?.paneId);

  if (!resolvedPane) {
    return { success: false } as const;
  }

  const result = await browserAutomate(command, {
    ...args,
    paneId: resolvedPane.paneId,
  } as Parameters<typeof browserAutomate<T>>[1]);

  return { success: true as const, result };
}

export function executeWebviewAction(
  context: PaneResolutionContext,
  paneId: string | undefined,
  action: (webview: WebviewTag) => void,
) {
  const resolvedPane = resolveBrowserPane(context, paneId);

  if (!resolvedPane) {
    return;
  }

  action(resolvedPane.webview);
  context.respondResult();
}
