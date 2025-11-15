import { useCommand } from "@/commands/hooks/useCommand";
import {
  inputToSession,
  serializeSession,
} from "@/components/panes/terminal/xtermCache";
import type { QuickPaneDescriptor } from "@/components/shell/QuickDialog";
import { tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import { ApplicationCommands } from "@shared/commands";
import type { WebviewTag } from "electron";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";

const { cli } = window.conduit;
const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

type UseCliClientOptions = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
};

export function useCliClient({ onOpenFile }: UseCliClientOptions) {
  const tabs = useAtomValue(tabsAtom);
  const tabsRef = useRef<Tab[]>(tabs);

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

  const splitLeftCommand = useCommand(ApplicationCommands.PANE_SPLIT_LEFT);
  const splitRightCommand = useCommand(ApplicationCommands.PANE_SPLIT_RIGHT);
  const splitTopCommand = useCommand(ApplicationCommands.PANE_SPLIT_TOP);
  const splitBottomCommand = useCommand(ApplicationCommands.PANE_SPLIT_BOTTOM);

  const moveCommandMap = {
    left: moveLeftCommand,
    right: moveRightCommand,
    up: moveUpCommand,
    down: moveDownCommand,
    tab: moveToTabCommand,
  } as const;

  const splitCommandMap = {
    left: splitLeftCommand,
    right: splitRightCommand,
    top: splitTopCommand,
    bottom: splitBottomCommand,
  } as const;

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const handleCliRequest = async ({
      requestId,
      sessionId,
      command: { name, args },
    }: CliRequest) => {
      const respond = <T>(response: Omit<CliResponse<T>, "requestId">) =>
        cli.respondToRequest<T>({
          requestId,
          ...response,
        });

      const respondResult = (result?: any) => respond({ result });
      const respondError = (error: string) => respond({ error });

      try {
        switch (name) {
          case "open-file": {
            const isCommitMessageRequest = args.filePath?.endsWith(
              COMMIT_EDITMSG_FILENAME,
            );

            const descriptor: QuickPaneDescriptor = {
              ...args,
              type: "editor",
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

          case "list-panes": {
            const currentTabs = tabsRef.current;
            const matchingTab = currentTabs.find((tab) =>
              Object.values(tab.panes).some(
                (pane) =>
                  pane.type === "terminal" && pane.sessionId === sessionId,
              ),
            );

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

          case "read-terminal": {
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

          case "capture-browser": {
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

          case "write-terminal": {
            const didWrite = inputToSession(args.sessionId, args.input);

            if (!didWrite) {
              respondError("Unable to write to terminal.");
              break;
            }

            respondResult();
            break;
          }

          case "move-pane": {
            const targetCommand = moveCommandMap[args.direction];
            await targetCommand.execute();

            respondResult();
            break;
          }

          case "split-pane": {
            const targetCommand = splitCommandMap[args.direction];
            await targetCommand.execute();

            respondResult();
            break;
          }

          case "focus-pane": {
            await focusPaneCommand.execute();
            respondResult();
            break;
          }

          case "close-pane": {
            const targetCommand = args.closeTab
              ? closeTabCommand
              : closePaneCommand;
            await targetCommand.execute();

            respondResult();
            break;
          }

          case "new-tab": {
            await newTabCommand.execute();
            respondResult();
            break;
          }

          case "duplicate-tab": {
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
    };

    const dispose = cli.onRequest(handleCliRequest);
    return () => {
      dispose();
    };
  }, [
    moveUpCommand,
    moveDownCommand,
    moveLeftCommand,
    moveRightCommand,
    moveToTabCommand,
    focusPaneCommand,
    closePaneCommand,
    closeTabCommand,
    newTabCommand,
    duplicateTabCommand,
    splitLeftCommand,
    splitRightCommand,
    splitTopCommand,
    splitBottomCommand,
    onOpenFile,
  ]);
}
