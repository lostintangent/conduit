import type { QuickPaneDescriptor } from "@/components/shell/QuickDialog";
import type { CliOpenFileRequestPayload, CliResponse } from "@shared/cli";
import { useEffect } from "react";

const api = window.conduit;
const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

type UseCliClientOptions = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
};

export function useCliClient({ onOpenFile }: UseCliClientOptions) {
  useEffect(() => {
    const handleCliRequest = async (payload: CliOpenFileRequestPayload) => {
      let didRespond = false;

      const respond = async (response: {
        status: CliResponse["status"];
        message?: string;
      }) => {
        if (didRespond) {
          return;
        }
        didRespond = true;
        await api.respondToCliRequest({
          requestId: payload.requestId,
          ...response,
        });
      };

      try {
        const isCommitMessageRequest = payload.filePath?.endsWith(
          COMMIT_EDITMSG_FILENAME
        );

        const descriptor: QuickPaneDescriptor = {
          type: "editor",
          cwd: payload.cwd,
          filePath: payload.filePath ?? undefined,
        };

        if (isCommitMessageRequest) {
          descriptor.isLocked = true;
          descriptor.closeOnSave = true;
          descriptor.onClose = () => respond({ status: "ok" });
        }

        onOpenFile(descriptor);

        if (!isCommitMessageRequest) {
          await respond({ status: "ok" });
        }
      } catch (error) {
        await respond({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to open file.",
        });
      }
    };

    const dispose = api.onCliOpenFileRequest((payload) =>
      handleCliRequest(payload)
    );

    return () => {
      dispose();
    };
  }, [onOpenFile]);
}
