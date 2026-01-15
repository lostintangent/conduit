import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import type { EditorPane } from "@/types";
import type { HandlerMap } from "./types";

type EditorQuickDescriptor = Omit<EditorPane, "id"> &
  Pick<
    QuickPaneDescriptor,
    "isLocked" | "closeOnSave" | "onClose" | "hideFileTree"
  >;

export const editorHandlers: Partial<HandlerMap> = {
  /**
   * Handle $EDITOR requests from CLI tools (git commit, Claude Code Ctrl+G, etc.).
   * Opens the file in a quick pane that closes on save, signaling completion
   * back to the calling tool.
   */
  "editor-open": (args, context) => {
    const commandArgs = args ?? { cwd: "" };

    return new Promise<void>((resolve) => {
      const descriptor: EditorQuickDescriptor = {
        type: "editor",
        cwd: commandArgs.cwd,
        file: commandArgs.filePath,
        isLocked: true,
        closeOnSave: true,
        hideFileTree: true,
        onClose: resolve,
      };
      context.onOpenFile(descriptor);
    });
  },
};
