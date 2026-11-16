import {
  newEditorPane,
  paneClosed,
} from "@features/workbench/client/actions/pane";
import { createTabWithPane } from "@features/workbench/client/actions/tab";
import { sidebarStateAtom } from "@features/workbench/client/sidebarStore";
import type { HandlerMap } from "@/cli/handlers/types";

export default {
  /**
   * Handle editor-open requests from the CLI.
   *
   * When --quick flag is passed (used by $EDITOR for git commit, etc.):
   * - Opens in a quick pane that closes on save
   * - Blocks until the editor closes, by save, Close or Esc
   *
   * Without --quick flag (direct CLI usage like `conduit file.txt`):
   * - Opens in the sidebar editor
   * - Returns immediately without blocking
   */
  "editor-open": (args) => {
    const commandArgs = args ?? { cwd: "" };

    // Quick mode: open in a quick pane, and wait until its editor closes,
    // wherever it went in the meantime
    if (commandArgs.quick) {
      const pane = newEditorPane(commandArgs.cwd, {
        file: commandArgs.filePath,
        closeOnSave: true,
      });
      createTabWithPane(pane, { quick: true });
      return paneClosed(pane.id);
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
} satisfies Partial<HandlerMap>;
