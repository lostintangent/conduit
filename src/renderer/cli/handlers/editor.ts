import type { HandlerSubset } from "./types";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";

const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

export const editorHandlers: HandlerSubset = {
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
};
