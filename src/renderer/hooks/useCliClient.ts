import { serializeSession } from "@/components/panes/terminal/xtermCache";
import type { QuickPaneDescriptor } from "@/components/shell/QuickDialog";
import { tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import type { CliRequest, CliResponse } from "@shared/cli";
import { useAtomValue } from "jotai";
import type { NativeImage, WebviewTag } from "electron";
import { useEffect, useRef } from "react";

const api = window.conduit;
const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

type UseCliClientOptions = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
};

export function useCliClient({ onOpenFile }: UseCliClientOptions) {
  const tabs = useAtomValue(tabsAtom);
  const tabsRef = useRef<Tab[]>(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const handleCliRequest = async (payload: CliRequest) => {
      const respond = (response: Omit<CliResponse, "requestId">) => api.respondToCliRequest({
        requestId: payload.requestId,
        ...response,
      });

      const respondOk = (data?: any) => respond({ status: "ok", data });
      const respondError = (message: string) => respond({ status: "error", message });

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

          case "get-panes": {
            const sessionId = payload.sessionId;
            const currentTabs = tabsRef.current;

            const matchingTab = currentTabs.find((tab) =>
              Object.values(tab.panes).some(
                (pane) =>
                  pane.type === "terminal" && pane.sessionId === sessionId,
              ),
            );

            const panes = Object.values(matchingTab.panes)
              .filter(
                (pane) =>
                  !(pane.type === "terminal" && pane.sessionId === sessionId),
              )
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
            const webview = document.getElementById(command.paneId) as
              | (WebviewTag & { capturePage?: () => Promise<NativeImage> })
              | null;

            if (!webview) {
              respondError(`Unable to find browser pane with id "${command.paneId}".`);
              break;
            }

            if (typeof webview.capturePage !== "function") {
              respondError(
                `Pane "${command.paneId}" does not support capturePage().`,
              );
              break;
            }

            try {
              const image = await webview.capturePage();
              const pngBuffer = image.toPNG();
              const filePath = await api.writeTempFile(pngBuffer, "png");
              respondOk({ filePath });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unknown capture error.";
              respondError(`Failed to capture browser pane: ${message}`);
            }

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
  }, [onOpenFile]);
}
