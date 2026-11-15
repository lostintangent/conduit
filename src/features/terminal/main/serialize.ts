import type { TerminalPane as SavedTerminalPane } from "@shared/types/panes";
import type { TerminalPane } from "@features/workbench/model";
import { captureTerminalCommand } from "./command";
import { getTerminal } from "./store";

/**
 * A terminal pane as a workspace saves it, with the command its shell is
 * running and its PTY's size, so both start again as they were. A clone only
 * saves which pane it shows. The session and the shell's title only last while
 * the app runs.
 */
export async function serializeTerminalPane(
  pane: TerminalPane,
): Promise<SavedTerminalPane> {
  const { sessionId, title: _title, ...saved } = pane;
  if (pane.cloneOf) return saved;

  const terminal = getTerminal(sessionId);
  return {
    ...saved,
    command: terminal ? await captureTerminalCommand(terminal) : null,
    cols: terminal?.pty.cols,
    rows: terminal?.pty.rows,
  };
}
