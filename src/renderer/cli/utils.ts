import { browserAutomate } from "@/cli/browser";
import { isHyperTerminal } from "@/store/actions/hyperTerminal";
import type { Tab, TerminalPane } from "@/types";
import type { WebviewTag } from "electron";

export type CliRequestContext = {
  tabs: Tab[];
  sessionId: string;
  activeTab?: Tab;
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

export function resolveBrowserPane(
  context: CliRequestContext,
  paneId?: string,
): { paneId: string; webview: WebviewTag } {
  const findBrowserPane = () => {
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

  return { paneId: resolvedPaneId, webview } as const;
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
  context: CliRequestContext,
  command: T,
  args: Parameters<typeof browserAutomate<T>>[1],
) {
  const resolvedPane = resolveBrowserPane(context, args?.paneId);

  const result = await browserAutomate(command, {
    ...args,
    paneId: resolvedPane.paneId,
  } as Parameters<typeof browserAutomate<T>>[1]);

  return result;
}

export function executeWebviewAction(
  context: CliRequestContext,
  paneId: string | undefined,
  action: (webview: WebviewTag) => void,
) {
  const resolvedPane = resolveBrowserPane(context, paneId);
  action(resolvedPane.webview);
}
