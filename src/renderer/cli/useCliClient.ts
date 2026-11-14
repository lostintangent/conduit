import { isHyperTerminal } from "@features/workbench/client/actions/hyperTerminal";
import { activeTabAtom, tabsAtom } from "@features/workbench/client/atoms";
import type { Tab } from "@features/workbench/model";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import { useEffect, useEffectEvent } from "react";
import { handlerMap, type HandlerContext } from "./handlers";

const { cli } = window.conduit;

function findCallingTerminalTab(
  tabs: Tab[],
  sessionId: string,
  activeTab: Tab | null,
): Tab {
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

export function useCliClient(activeCwd: string) {
  const handleCliRequest = useEffectEvent(
    async ({ requestId, sessionId, command: { name, args } }: CliRequest) => {
      let isResponseSuppressed = false;
      // Read when the request arrives, so the window doesn't re-render for
      // every tab change just to keep these current.
      const tabs = tabsAtom.get();
      const activeTab = activeTabAtom.get();

      const respond = <T>(response: Omit<CliResponse<T>, "requestId">) => {
        cli.respondToRequest<T>({
          requestId,
          ...response,
        });
      };

      const respondResult = (result?: unknown) => respond({ result });
      const respondError = (error: string) => respond({ error });

      const handler = handlerMap[name];

      if (!handler) {
        respondError("Unsupported CLI command.");
        return;
      }

      const suppressResponse = () => {
        isResponseSuppressed = true;
      };

      const context: HandlerContext = {
        requestId,
        sessionId,
        activeTab,
        activeCwd,
        suppressResponse,
        findCallingTerminalTab: () =>
          findCallingTerminalTab(tabs, sessionId, activeTab),
      };

      try {
        const result = await handler((args ?? {}) as any, context);

        if (!isResponseSuppressed) {
          respondResult(result);
        }
      } catch (error) {
        respondError((error as Error).message);
      }
    },
  );

  useEffect(() => {
    const dispose = cli.onRequest(handleCliRequest);
    return () => {
      dispose();
    };
  }, [handleCliRequest]);
}
