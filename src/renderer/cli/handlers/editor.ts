import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import { sidebarStateAtom } from "@/store/atoms";
import type { EditorPane } from "@/types";
import { getDefaultStore } from "jotai";
import type { HandlerMap } from "./types";

const store = getDefaultStore();

const COMMIT_EDITMSG_FILENAME = "COMMIT_EDITMSG";

type EditorQuickDescriptor = Omit<EditorPane, "id"> &
  Pick<QuickPaneDescriptor, "isLocked" | "closeOnSave" | "onClose">;

export const editorHandlers: Partial<HandlerMap> = {
  "editor-open": (args, context) => {
    const commandArgs = args ?? { cwd: "" };
    const isCommitMessageRequest = commandArgs.filePath?.endsWith(
      COMMIT_EDITMSG_FILENAME,
    );

    // For commit messages, still use quick pane (needs isLocked, closeOnSave, onClose)
    if (isCommitMessageRequest) {
      return new Promise<void>((resolve) => {
        const descriptor: EditorQuickDescriptor = {
          type: "editor",
          cwd: commandArgs.cwd,
          file: commandArgs.filePath,
          isLocked: true,
          closeOnSave: true,
          onClose: resolve,
        };
        context.onOpenFile(descriptor);
      });
    }

    store.set(sidebarStateAtom, {
      isOpen: true,
      view: "editor",
      navigation: {
        cwd: commandArgs.cwd,
        editorTreeMode: "all",
        editorFile: commandArgs.filePath,
      },
    });
  },
};
