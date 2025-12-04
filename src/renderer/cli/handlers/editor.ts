import type { HandlerMap } from "./types";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";

const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

export const editorHandlers: Partial<HandlerMap> = {
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
      return new Promise<void>((resolve) => {
        descriptor.isLocked = true;
        descriptor.closeOnSave = true;
        descriptor.onClose = resolve;
        context.onOpenFile(descriptor);
      });
    }

    context.onOpenFile(descriptor);
  },
};
