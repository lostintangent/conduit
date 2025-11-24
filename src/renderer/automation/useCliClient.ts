import { browserAutomate } from "@/automation/browser";
import { useCommand } from "@/commands/hooks/useCommand";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";
import { serializeSession } from "@/components/panes/terminal/xtermCache";
import { activeTabAtom, floatingTerminalAtom, tabsAtom } from "@/store/atoms";
import type { TerminalPane } from "@/types";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import { ApplicationCommands } from "@shared/commands";
import type { WebviewTag } from "electron";
import { useAtomValue } from "jotai";
import { useEffect, useEffectEvent } from "react";

const { cli } = window.conduit;
const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

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
  const newTabCommand = useCommand(ApplicationCommands.TAB_NEW);
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

      // Helper function to execute a webview action
      const executeWebviewAction = (
        paneId: string,
        action: (webview: WebviewTag) => void,
      ) => {
        const webview = document.getElementById(paneId) as WebviewTag;
        if (!webview) {
          respondError(`Browser pane ${paneId} not found.`);
          return;
        }
        action(webview);
        respondResult();
      };

      // Helper function to find the tab containing the calling terminal
      const findCallingTerminalTab = () => {
        let matchingTab = tabs.find((tab) =>
          Object.values(tab.panes).some(
            (pane) => pane.type === "terminal" && pane.sessionId === sessionId,
          ),
        );

        // If the session isn't in any tab, check if it's the floating terminal
        if (!matchingTab) {
          if (floatingTerminal?.terminalId === sessionId) {
            matchingTab = activeTab;
          }
        }

        return matchingTab;
      };

      try {
        switch (name) {
          case "editor-open": {
            const isCommitMessageRequest = args.filePath?.endsWith(
              COMMIT_EDITMSG_FILENAME,
            );

            const descriptor: QuickPaneDescriptor = {
              ...args,
              type: "editor",
              vmId: args.vmId ?? "local",
            };

            if (isCommitMessageRequest) {
              descriptor.isLocked = true;
              descriptor.closeOnSave = true;
              descriptor.onClose = respondResult;
            } else {
              respondResult();
            }

            onOpenFile(descriptor);
            break;
          }

          case "pane-list": {
            const matchingTab = findCallingTerminalTab();

            const panes = Object.values(matchingTab.panes)
              // Filter out the calling terminal pane
              .filter(
                (pane) =>
                  !(pane.type === "terminal" && pane.sessionId === sessionId),
              )
              // Filter the panes by the requested type
              .filter((pane) => {
                if (args.paneType === "all") {
                  return true;
                }

                // TODO: Remove this once we rename "webview" panes to "browser".
                if (args?.paneType === "browser") {
                  return pane.type === "webview";
                }

                return pane.type === args.paneType;
              })
              .map((pane) => ({ ...pane }));

            respondResult(panes);
            break;
          }

          case "terminal-read": {
            const serialized = serializeSession(args.sessionId);

            if (serialized === null) {
              respondError(
                `Unable to read terminal buffer; session ${args.sessionId} is not active.`,
              );
              break;
            }

            respondResult(serialized);
            break;
          }

          case "browser-capture": {
            const webview = document.getElementById(args?.paneId) as WebviewTag;
            const webContentsId = webview.getWebContentsId();

            // Note that when trying to capture the page from the renderer, Chrome
            // kept throwing exceptions that I couldn't figure out. So we're currently
            // delegating this back to the main process to handle. This feels like a
            // total hack, but it works for now. And we'll eventually move from using
            // <webviews> to WebContentsViews in the future anyways. So it seems OK for now.
            await cli.completeCaptureBrowserRequest({
              requestId,
              webContentsId,
            });
            break;
          }

          case "browser-query": {
            const results = await browserAutomate("query", args);
            respondResult(results);
            break;
          }

          case "browser-click": {
            await browserAutomate("click", args);
            respondResult();
            break;
          }

          case "browser-hover": {
            await browserAutomate("hover", args);
            respondResult();
            break;
          }

          case "browser-focus": {
            await browserAutomate("focus", args);
            respondResult();
            break;
          }

          case "browser-type": {
            await browserAutomate("type", args);
            respondResult();
            break;
          }

          case "browser-keys": {
            await browserAutomate("keys", args);
            respondResult();
            break;
          }

          case "browser-scroll": {
            await browserAutomate("scroll", args);
            respondResult();
            break;
          }

          case "browser-wait": {
            await browserAutomate("waitFor", args);
            respondResult();
            break;
          }

          case "browser-navigate": {
            executeWebviewAction(args?.paneId, (webview) =>
              webview.loadURL(args.url),
            );
            break;
          }

          case "browser-back": {
            executeWebviewAction(args?.paneId, (webview) => webview.goBack());
            break;
          }

          case "browser-forward": {
            executeWebviewAction(args?.paneId, (webview) =>
              webview.goForward(),
            );
            break;
          }

          case "browser-refresh": {
            executeWebviewAction(args?.paneId, (webview) => webview.reload());
            break;
          }

          case "terminal-write": {
            // Determine target session IDs based on wildcard or specific session
            let targetSessionIds: string[];

            if (args.sessionId === "*") {
              // Find the tab containing the calling terminal
              const matchingTab = findCallingTerminalTab();

              if (!matchingTab) {
                respondError("Unable to find the calling terminal's tab.");
                break;
              }

              // Get all terminal panes in the tab, excluding the caller
              targetSessionIds = Object.values(matchingTab.panes)
                .filter(
                  (pane) =>
                    pane.type === "terminal" && pane.sessionId !== sessionId,
                )
                .map((pane) => (pane as TerminalPane).sessionId);

              if (targetSessionIds.length === 0) {
                respondError("No other terminals found in the tab.");
                break;
              }
            } else {
              // Single terminal case
              targetSessionIds = [args.sessionId];
            }

            // Send input to all target terminals
            let successCount = 0;
            for (const targetSessionId of targetSessionIds) {
              // Send the input text
              window.conduit.sendKeypress(targetSessionId, args.input);

              // If enter flag is set, wait briefly then send Enter key. The 100ms delay gives TUIs time to process the input before receiving Enter
              if (args.enter) {
                await new Promise((resolve) => setTimeout(resolve, 50));
                window.conduit.sendKeypress(targetSessionId, "\r");
              }

              successCount++;
            }

            if (successCount === 0) {
              respondError("Unable to write to terminal.");
              break;
            }

            respondResult();
            break;
          }

          case "pane-move": {
            const targetCommand = moveCommandMap[args.direction];
            await targetCommand.execute();

            respondResult();
            break;
          }

          case "pane-split": {
            const targetCommand =
              splitCommandMap[args.paneType][args.direction];
            await targetCommand.execute();

            respondResult();
            break;
          }

          case "pane-focus": {
            await focusPaneCommand.execute();
            respondResult();
            break;
          }

          case "pane-close": {
            const targetCommand = args.closeTab
              ? closeTabCommand
              : closePaneCommand;
            await targetCommand.execute();

            respondResult();
            break;
          }

          case "tab-new": {
            await newTabCommand.execute();
            respondResult();
            break;
          }

          case "tab-duplicate": {
            await duplicateTabCommand.execute();
            respondResult();
            break;
          }

          default:
            respondError("Unsupported CLI command.");
        }
      } catch (error) {
        respondError(error.message);
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
