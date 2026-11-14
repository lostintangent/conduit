import {
  automateBrowser,
  findCallingTerminalTab,
  resolveBrowserPane,
  resolveCanvasPane,
  resolveTerminalSessions,
} from "@/cli/utils";
import { activeTabAtom, quickPaneAtom, tabsAtom } from "@/store/atoms";
import { sidebarStateAtom } from "@/store/sidebarStore";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import { useEffect, useEffectEvent } from "react";
import { handlerMap, type HandlerContext } from "./handlers";

const { cli } = window.conduit;

export function useCliClient(activeCwd: string) {
  const setQuickPane = quickPaneAtom.set;

  const handleCliRequest = useEffectEvent(
    async ({ requestId, sessionId, command: { name, args } }: CliRequest) => {
      let isResponseSuppressed = false;
      // Read when the request arrives, so the window doesn't re-render for
      // every tab change just to keep these current.
      const tabs = tabsAtom.get();
      const activeTab = activeTabAtom.get();
      const sidebarState = sidebarStateAtom.get();

      const respond = <T>(response: Omit<CliResponse<T>, "requestId">) => {
        cli.respondToRequest<T>({
          requestId,
          ...response,
        });
      };

      const respondResult = (result?: unknown) => respond({ result });
      const respondError = (error: string) => respond({ error });

      const resolutionContext = {
        tabs,
        sessionId,
        activeTab,
      } as const;

      // Browser and canvas need sidebar state for resolution
      const sidebarAwareContext = {
        ...resolutionContext,
        isSidebarOpen: sidebarState.isOpen,
        sidebarView: sidebarState.view,
        activeCwd,
      } as const;

      const handler = handlerMap[name];

      if (!handler) {
        respondError("Unsupported CLI command.");
        return;
      }

      const suppressResponse = () => {
        isResponseSuppressed = true;
      };

      const context: HandlerContext = {
        onOpenFile: setQuickPane,
        requestId,
        sessionId,
        activeTab,
        tabs,
        suppressResponse,
        findCallingTerminalTab: () => findCallingTerminalTab(resolutionContext),
        resolveTerminalSessions: (paneId?: string, all?: boolean) =>
          resolveTerminalSessions(resolutionContext, paneId, all),
        resolveBrowserPane: (paneId?: string) =>
          resolveBrowserPane(sidebarAwareContext, paneId),
        resolveCanvasPane: (paneId?: string) =>
          resolveCanvasPane(sidebarAwareContext, paneId),
        automateBrowser: (command, automationArgs) =>
          automateBrowser(sidebarAwareContext, command, automationArgs),
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
