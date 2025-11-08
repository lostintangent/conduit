import { useCommand } from "@/commands/hooks/useCommand";
import {
  inputToSession,
  serializeSession,
} from "@/components/panes/terminal/xtermCache";
import type { QuickPaneDescriptor } from "@/components/shell/QuickDialog";
import { tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import type { CliRequest, CliResponse } from "@shared/cli";
import { ApplicationCommands } from "@shared/commands";
import type { WebviewTag } from "electron";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";

const api = window.conduit;
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

  const moveCommandMap = {
    left: moveLeftCommand,
    right: moveRightCommand,
    up: moveUpCommand,
    down: moveDownCommand,
    tab: moveToTabCommand,
  } as const;

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const handleCliRequest = async (payload: CliRequest) => {
      const respond = (response: Omit<CliResponse, "requestId">) =>
        api.respondToCliRequest({
          requestId: payload.requestId,
          ...response,
        });

      const respondOk = (data?: any) => respond({ status: "ok", data });
      const respondError = (message: string) =>
        respond({ status: "error", message });

      try {
        const { command } = payload;
        switch (command.type) {
          case "open-file": {
            const isCommitMessageRequest = command.filePath?.endsWith(
              COMMIT_EDITMSG_FILENAME,
            );

            const descriptor: QuickPaneDescriptor = {
              ...command,
              type: "editor",
            };

            if (isCommitMessageRequest) {
              descriptor.isLocked = true;
              descriptor.closeOnSave = true;
              descriptor.onClose = respondOk;
            } else {
              respondOk();
            }

            onOpenFile(descriptor);
            break;
          }

          case "list-panes": {
            const sessionId = payload.sessionId;
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
                if (command.paneType === "all") {
                  return true;
                }

                // TODO: Remove this once we rename "webview" panes to "browser".
                if (command.paneType === "browser") {
                  return pane.type === "webview";
                }

                return pane.type === command.paneType;
              })
              .map((pane) => ({ ...pane }));

            respondOk(panes);
            break;
          }

          case "read-terminal": {
            const serialized = serializeSession(command.sessionId);

            if (serialized === null) {
              respondError(
                `Unable to read terminal buffer; session ${command.sessionId} is not active.`,
              );
              break;
            }

            respondOk(serialized);
            break;
          }

          case "capture-browser": {
            const webview = document.getElementById(
              command.paneId,
            ) as WebviewTag;
            const webContentsId = webview.getWebContentsId();

            // Note that when trying to capture the page from the renderer, Chrome
            // kept throwing exceptions that I couldn't figure out. So we're currently
            // delegating this back to the main process to handle. This feels like a
            // total hack, but it works for now. And we'll eventually move from using
            // <webviews> to WebContentsViews in the future anyways. So it seems OK for now.
            await api.completeCaptureBrowserRequest({
              requestId: payload.requestId,
              webContentsId,
            });
            break;
          }

          case "write-terminal": {
            const didWrite = inputToSession(command.sessionId, command.input);

            if (!didWrite) {
              respondError("Unable to write to terminal.");
              break;
            }

            respondOk();
            break;
          }

          case "move-pane": {
            const targetCommand = moveCommandMap[command.direction];
            if (!targetCommand) {
              respondError("Unable to move pane in the specified direction.");
              break;
            }

            await targetCommand.execute();
            respondOk();
            break;
          }

          default:
            respondError("Unsupported CLI command.");
        }
      } catch (error) {
        respondError(error.message);
      }
    };

    const dispose = api.onCliRequest(handleCliRequest);
    return () => {
      dispose();
    };
  }, [
    moveDownCommand.disabled,
    moveDownCommand.execute,
    moveLeftCommand.disabled,
    moveLeftCommand.execute,
    moveRightCommand.disabled,
    moveRightCommand.execute,
    moveToTabCommand.disabled,
    moveToTabCommand.execute,
    moveUpCommand.disabled,
    moveUpCommand.execute,
    onOpenFile,
  ]);
}
