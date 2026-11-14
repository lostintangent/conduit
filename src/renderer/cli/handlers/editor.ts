import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import { sidebarStateAtom } from "@/store/sidebarStore";
import type { EditorPane } from "@/types";
import type { HandlerMap } from "./types";

type EditorQuickDescriptor = Omit<EditorPane, "id"> &
  Pick<QuickPaneDescriptor, "closeOnSave" | "onClose">;

export const editorHandlers: Partial<HandlerMap> = {
  /**
   * Handle editor-open requests from the CLI.
   *
   * When --quick flag is passed (used by $EDITOR for git commit, etc.):
   * - Opens in a modal quick pane that closes on save
   * - Blocks until the user saves and closes the editor
   *
   * Without --quick flag (direct CLI usage like `conduit file.txt`):
   * - Opens in the sidebar editor
   * - Returns immediately without blocking
   */
  "editor-open": (args, context) => {
    const commandArgs = args ?? { cwd: "" };

    // Quick mode: open in modal dialog, block until closed
    if (commandArgs.quick) {
      return new Promise<void>((resolve) => {
        const descriptor: EditorQuickDescriptor = {
          type: "editor",
          cwd: commandArgs.cwd,
          file: commandArgs.filePath,
          closeOnSave: true,
          onClose: resolve,
        };
        context.onOpenFile(descriptor);
      });
    }

    // Normal mode: open in sidebar, return immediately
    sidebarStateAtom.set({
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
