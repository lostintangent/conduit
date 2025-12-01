import {
  automateBrowser,
  executeWebviewAction,
  findCallingTerminalTab,
  resolveBrowserPane,
  resolveTerminalSessions,
} from "@/cli/utils";
import type { browserAutomate } from "@/cli/browser";
import { useCommand } from "@/commands/hooks/useCommand";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";
import { serializeSession } from "@/components/panes/terminal/xtermCache";
import { openTab } from "@/store/actions/tab";
import {
  dismissNotification,
  enqueueNotification,
} from "@/store/actions/notifications";
import { activatePane } from "@/store/actions/pane";
import { focusTab } from "@/store/actions/tab";
import { activeTabAtom, floatingTerminalAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import type { CliCommand, CliRequest, CliResponse } from "@shared/cli/types";
import { ApplicationCommands } from "@shared/commands";
import { normalizeUrl } from "@/utils/browser";
import { useAtomValue } from "jotai";
import { useEffect, useEffectEvent } from "react";

const { cli } = window.conduit;
const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

type HandlerArgs<Name extends CliCommand["name"]> = Extract<
  CliCommand,
  { name: Name }
>["args"];

type HandlerContext = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
  requestId: string;
  sessionId: string;
  activeTab?: Tab;
  tabs: Tab[];
  floatingTerminal?: { terminalId: string };
  respondResult: (result?: unknown) => void;
  respondError: (message: string) => void;
  findCallingTerminalTab: () => Tab | null;
  resolveTerminalSessions: (paneId?: string, all?: boolean) => string[] | null;
  resolveBrowserPane: (
    paneId?: string,
  ) => { paneId: string; webview: Electron.WebviewTag } | null;
  executeWebviewAction: (
    paneId: string | undefined,
    action: (webview: Electron.WebviewTag) => void,
  ) => void;
  automateBrowser: <T extends Parameters<typeof browserAutomate>[0]>(
    command: T,
    args: Parameters<typeof browserAutomate<T>>[1],
  ) => Promise<{ success: boolean; result?: unknown }>;
  moveCommandMap: typeof moveCommandMap;
  splitCommandMap: typeof splitCommandMap;
  focusPaneCommand: ReturnType<typeof useCommand>;
  closePaneCommand: ReturnType<typeof useCommand>;
  closeTabCommand: ReturnType<typeof useCommand>;
  duplicateTabCommand: ReturnType<typeof useCommand>;
};

type CliHandler<Name extends CliCommand["name"]> = (
  args: HandlerArgs<Name>,
  context: HandlerContext,
) => Promise<void> | void;

type HandlerMap = {
  [Name in CliCommand["name"]]: CliHandler<Name>;
};

const handlerMap: HandlerMap = {
  "editor-open": (args, context) => {
    const commandArgs = args ?? { cwd: "" };
    const isCommitMessageRequest = commandArgs.filePath?.endsWith(
      COMMIT_EDITMSG_FILENAME,
    );

    const descriptor: QuickPaneDescriptor = {
      ...commandArgs,
      type: "editor",
    };

    if (isCommitMessageRequest) {
      descriptor.isLocked = true;
      descriptor.closeOnSave = true;
      descriptor.onClose = context.respondResult;
    } else {
      context.respondResult();
    }

    context.onOpenFile(descriptor);
  },

  "pane-list": (args, context) => {
    const matchingTab = context.findCallingTerminalTab();

    if (!matchingTab) {
      context.respondError("Unable to find the calling terminal's tab.");
      return;
    }

    const panes = Object.values(matchingTab.panes)
      .filter(
        (pane) =>
          !(pane.type === "terminal" && pane.sessionId === context.sessionId),
      )
      .filter((pane) => {
        if (args?.paneType === "all") {
          return true;
        }

        if (args?.paneType === "browser") {
          return pane.type === "webview";
        }

        return pane.type === args?.paneType;
      })
      .map((pane) => ({ ...pane }));

    context.respondResult(panes);
  },

  "terminal-read": async (args, context) => {
    const targetSessionIds = context.resolveTerminalSessions(
      args?.paneId,
      args?.all,
    );

    if (!targetSessionIds) {
      return;
    }

    if (targetSessionIds.length > 1) {
      const results: string[] = [];
      for (const targetSessionId of targetSessionIds) {
        const serialized = serializeSession(targetSessionId);
        if (serialized !== null) {
          results.push(serialized);
        }
      }

      if (results.length === 0) {
        context.respondError("Unable to read terminal buffers.");
        return;
      }

      context.respondResult(results.join("\n---\n"));
      return;
    }

    const serialized = serializeSession(targetSessionIds[0]);

    if (serialized === null) {
      context.respondError(
        `Unable to read terminal buffer; terminal is not active.`,
      );
      return;
    }

    context.respondResult(serialized);
  },

  "browser-capture": async (args, context) => {
    const resolvedPane = context.resolveBrowserPane(args?.paneId);

    if (!resolvedPane) {
      return;
    }

    const webContentsId = resolvedPane.webview.getWebContentsId();

    await cli.completeCaptureBrowserRequest({
      requestId: context.requestId,
      webContentsId,
    });
  },

  "browser-query": async (args, context) => {
    const automationResult = await context.automateBrowser("query", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult(automationResult.result);
  },

  "browser-click": async (args, context) => {
    const automationResult = await context.automateBrowser("click", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-hover": async (args, context) => {
    const automationResult = await context.automateBrowser("hover", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-focus": async (args, context) => {
    const automationResult = await context.automateBrowser("focus", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-type": async (args, context) => {
    const automationResult = await context.automateBrowser("type", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-keys": async (args, context) => {
    const automationResult = await context.automateBrowser("keys", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-scroll": async (args, context) => {
    const automationResult = await context.automateBrowser("scroll", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-wait": async (args, context) => {
    const automationResult = await context.automateBrowser("waitFor", args);

    if (!automationResult.success) {
      return;
    }

    context.respondResult();
  },

  "browser-navigate": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) =>
      webview.loadURL(normalizeUrl(args.url)),
    );
  },

  "browser-back": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) => webview.goBack());
  },

  "browser-forward": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) =>
      webview.goForward(),
    );
  },

  "browser-refresh": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) => webview.reload());
  },

  "terminal-write": async (args, context) => {
    const targetSessionIds = context.resolveTerminalSessions(
      args?.paneId,
      args?.all,
    );

    if (!targetSessionIds) {
      return;
    }

    for (const targetSessionId of targetSessionIds) {
      window.conduit.sendKeypress(targetSessionId, args.input);

      if (args.enter) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        window.conduit.sendKeypress(targetSessionId, "\r");
      }
    }

    context.respondResult();
  },

  "pane-move": async (args, context) => {
    const targetCommand = context.moveCommandMap[args.direction];
    await targetCommand.execute();

    context.respondResult();
  },

  "pane-split": async (args, context) => {
    const targetCommand =
      context.splitCommandMap[args.paneType][args.direction];
    await targetCommand.execute();

    context.respondResult();
  },

  "pane-focus": async (_args, context) => {
    await context.focusPaneCommand.execute();
    context.respondResult();
  },

  "pane-close": async (args, context) => {
    const targetCommand = args.closeTab
      ? context.closeTabCommand
      : context.closePaneCommand;
    await targetCommand.execute();

    context.respondResult();
  },

  "tab-new": async (args, context) => {
    await openTab({
      title: args?.title,
      command: args?.command,
    });
    context.respondResult();
  },

  "tab-duplicate": async (_args, context) => {
    await context.duplicateTabCommand.execute();
    context.respondResult();
  },

  notify: (args, context) => {
    const matchingTab = context.findCallingTerminalTab();

    if (!matchingTab) {
      context.respondError("Unable to find the calling terminal's tab.");
      return;
    }

    const callingPane = Object.entries(matchingTab.panes).find(
      ([, pane]) =>
        pane.type === "terminal" && pane.sessionId === context.sessionId,
    );

    if (!callingPane) {
      context.respondError("Unable to find the calling terminal's pane.");
      return;
    }

    const isAlreadyActive =
      matchingTab.id === context.activeTab?.id &&
      callingPane[0] === context.activeTab?.activePaneId;

    const notificationId = enqueueNotification({
      kind: "info",
      message: args.message,
      persistent: args.persistent ?? false,
      actions: !isAlreadyActive
        ? [
            {
              label: "Focus terminal",
              onClick: () => {
                focusTab(matchingTab.id);
                activatePane(matchingTab.id, callingPane[0]);

                dismissNotification(notificationId);
              },
            },
          ]
        : undefined,
    });

    context.respondResult();
  },
};

type UseCliClientOptions = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
};

export function useCliClient({ onOpenFile }: UseCliClientOptions) {
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const floatingTerminal = useAtomValue(floatingTerminalAtom);

  const moveLeftCommand = useCommand(ApplicationCommands.PANE_MOVE_LEFT);
  const moveRightCommand = useCommand(ApplicationCommands.PANE_MOVE_RIGHT);
  const moveUpCommand = useCommand(ApplicationCommands.PANE_MOVE_UP);
  const moveDownCommand = useCommand(ApplicationCommands.PANE_MOVE_DOWN);
  const moveToTabCommand = useCommand(ApplicationCommands.PANE_MOVE_TO_TAB);

  const focusPaneCommand = useCommand(ApplicationCommands.PANE_FOCUS);
  const closePaneCommand = useCommand(ApplicationCommands.PANE_CLOSE);
  const closeTabCommand = useCommand(ApplicationCommands.TAB_CLOSE);
  const duplicateTabCommand = useCommand(ApplicationCommands.TAB_DUPLICATE);

  const splitLeftTerminalCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_LEFT,
  );
  const splitRightTerminalCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_RIGHT,
  );
  const splitTopTerminalCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_TOP,
  );
  const splitBottomTerminalCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_BOTTOM,
  );

  const splitLeftBrowserCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_LEFT_BROWSER,
  );
  const splitRightBrowserCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_RIGHT_BROWSER,
  );
  const splitTopBrowserCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_TOP_BROWSER,
  );
  const splitBottomBrowserCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_BOTTOM_BROWSER,
  );

  const splitLeftEditorCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_LEFT_EDITOR,
  );
  const splitRightEditorCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_RIGHT_EDITOR,
  );
  const splitTopEditorCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_TOP_EDITOR,
  );
  const splitBottomEditorCommand = useCommand(
    ApplicationCommands.PANE_SPLIT_BOTTOM_EDITOR,
  );

  const moveCommandMap = {
    left: moveLeftCommand,
    right: moveRightCommand,
    up: moveUpCommand,
    down: moveDownCommand,
    tab: moveToTabCommand,
  } as const;

  const splitCommandMap = {
    terminal: {
      left: splitLeftTerminalCommand,
      right: splitRightTerminalCommand,
      top: splitTopTerminalCommand,
      bottom: splitBottomTerminalCommand,
    },
    browser: {
      left: splitLeftBrowserCommand,
      right: splitRightBrowserCommand,
      top: splitTopBrowserCommand,
      bottom: splitBottomBrowserCommand,
    },
    editor: {
      left: splitLeftEditorCommand,
      right: splitRightEditorCommand,
      top: splitTopEditorCommand,
      bottom: splitBottomEditorCommand,
    },
  } as const;

  const handleCliRequest = useEffectEvent(
    async ({ requestId, sessionId, command: { name, args } }: CliRequest) => {
      const respond = <T>(response: Omit<CliResponse<T>, "requestId">) =>
        cli.respondToRequest<T>({
          requestId,
          ...response,
        });

      const respondResult = (result?: any) => respond({ result });
      const respondError = (error: string) => respond({ error });

      const resolutionContext = {
        tabs,
        sessionId,
        floatingTerminal,
        activeTab,
        respondResult,
        respondError,
      } as const;

      const handler = handlerMap[name];

      if (!handler) {
        respondError("Unsupported CLI command.");
        return;
      }

      const context: HandlerContext = {
        onOpenFile,
        requestId,
        sessionId,
        activeTab,
        tabs,
        floatingTerminal,
        respondResult,
        respondError,
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
        await handler(args as HandlerArgs<typeof name>, context);
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
