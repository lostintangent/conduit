import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import type { EditorPane } from "@/types";
import type { HandlerMap } from "./types";

const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

type EditorQuickDescriptor = Omit<EditorPane, "id"> &
  Pick<QuickPaneDescriptor, "isLocked" | "closeOnSave" | "onClose">;

export const editorHandlers: Partial<HandlerMap> = {
  "editor-open": (args, context) => {
    const commandArgs = args ?? { cwd: "" };
    const isCommitMessageRequest = commandArgs.filePath?.endsWith(
      COMMIT_EDITMSG_FILENAME,
    );

    const descriptor: EditorQuickDescriptor = {
      type: "editor",
      cwd: commandArgs.cwd,
      file: commandArgs.filePath,
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
