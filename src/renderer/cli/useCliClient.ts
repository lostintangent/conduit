import {
  automateBrowser,
  executeWebviewAction,
  findCallingTerminalTab,
  resolveBrowserPane,
  resolveTerminalSessions,
} from "@/cli/utils";
import { useCommand } from "@/commands/hooks/useCommand";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";
import { activeTabAtom, tabsAtom } from "@/store/atoms";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import { ApplicationCommands } from "@shared/commands";
import { useAtomValue } from "jotai";
import { useEffect, useEffectEvent } from "react";
import {
  handlerMap,
  type HandlerContext,
  type ReturnTypeUseCommand,
} from "./handlers";

const { cli } = window.conduit;

type CommandConfig<T extends string> = Record<
  T,
  (typeof ApplicationCommands)[keyof typeof ApplicationCommands]
>;

function useCommandMap<T extends string>(commands: CommandConfig<T>) {
  const entries = Object.entries(commands) as [
    T,
    (typeof ApplicationCommands)[keyof typeof ApplicationCommands],
  ][];

  return Object.fromEntries(
    entries.map(([key, command]) => [key, useCommand(command)]),
  ) as Record<T, ReturnTypeUseCommand>;
}

type SplitCommandConfig<T extends string> = Record<T, CommandConfig<string>>;

function useSplitCommandMap<T extends string>(commands: SplitCommandConfig<T>) {
  return Object.fromEntries(
    Object.entries(commands).map(([paneType, paneCommands]) => [
      paneType,
      useCommandMap(paneCommands as CommandConfig<string>),
    ]),
  ) as Record<T, Record<string, ReturnTypeUseCommand>>;
}

type UseCliClientOptions = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
};

export function useCliClient({ onOpenFile }: UseCliClientOptions) {
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);

  const moveCommandMap = useCommandMap({
    left: ApplicationCommands.PANE_MOVE_LEFT,
    right: ApplicationCommands.PANE_MOVE_RIGHT,
    up: ApplicationCommands.PANE_MOVE_UP,
    down: ApplicationCommands.PANE_MOVE_DOWN,
    tab: ApplicationCommands.PANE_MOVE_TO_TAB,
  } as const);

  const splitCommandMap = useSplitCommandMap({
    terminal: {
      left: ApplicationCommands.PANE_SPLIT_LEFT,
      right: ApplicationCommands.PANE_SPLIT_RIGHT,
      top: ApplicationCommands.PANE_SPLIT_TOP,
      bottom: ApplicationCommands.PANE_SPLIT_BOTTOM,
    },
    browser: {
      left: ApplicationCommands.PANE_SPLIT_LEFT_BROWSER,
      right: ApplicationCommands.PANE_SPLIT_RIGHT_BROWSER,
      top: ApplicationCommands.PANE_SPLIT_TOP_BROWSER,
      bottom: ApplicationCommands.PANE_SPLIT_BOTTOM_BROWSER,
    },
    editor: {
      left: ApplicationCommands.PANE_SPLIT_LEFT_EDITOR,
      right: ApplicationCommands.PANE_SPLIT_RIGHT_EDITOR,
      top: ApplicationCommands.PANE_SPLIT_TOP_EDITOR,
      bottom: ApplicationCommands.PANE_SPLIT_BOTTOM_EDITOR,
    },
  } as const);

  const focusPaneCommand = useCommand(ApplicationCommands.PANE_FOCUS);
  const closePaneCommand = useCommand(ApplicationCommands.PANE_CLOSE);
  const closeTabCommand = useCommand(ApplicationCommands.TAB_CLOSE);
  const duplicateTabCommand = useCommand(ApplicationCommands.TAB_DUPLICATE);

  const handleCliRequest = useEffectEvent(
    async ({ requestId, sessionId, command: { name, args } }: CliRequest) => {
      let isResponseSuppressed = false;

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

      const handler = handlerMap[name];

      if (!handler) {
        respondError("Unsupported CLI command.");
        return;
      }

      const suppressResponse = () => {
        isResponseSuppressed = true;
      };

      const context: HandlerContext = {
        onOpenFile,
        requestId,
        sessionId,
        activeTab,
        tabs,
        suppressResponse,
        findCallingTerminalTab: () => findCallingTerminalTab(resolutionContext),
        resolveTerminalSessions: (paneId?: string, all?: boolean) =>
          resolveTerminalSessions(resolutionContext, paneId, all),
        resolveBrowserPane: (paneId?: string) =>
          resolveBrowserPane(resolutionContext, paneId),
        executeWebviewAction: (paneId, action) =>
          executeWebviewAction(resolutionContext, paneId, action),
        automateBrowser: (command, automationArgs) =>
          automateBrowser(resolutionContext, command, automationArgs),
        moveCommandMap,
        splitCommandMap,
        focusPaneCommand,
        closePaneCommand,
        closeTabCommand,
        duplicateTabCommand,
      };

      try {
        const result = await handler(args as any, context);

        if (!isResponseSuppressed) {
          respondResult(result);
        }
      } catch ({ message }) {
        respondError(message);
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
