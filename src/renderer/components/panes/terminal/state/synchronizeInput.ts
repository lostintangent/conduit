import { notifyUserInput } from "@/components/panes/terminal/state/stateTracker";
import { activeTabAtom } from "@/store/atoms";

const api = window.conduit;

export function broadcastTerminalInput(sourcePaneId: string, input: string) {
  const activeTab = activeTabAtom.get();
  if (!activeTab || !activeTab.synchronized) {
    return;
  }

  if (activeTab.activePaneId !== sourcePaneId) {
    return;
  }

  // Filter out terminal responses that shouldn't be broadcast:
  // - \x1b[O = focus lost
  // - \x1b[I = focus gained
  // - \x1b]... = OSC (Operating System Command) responses like color queries
  // - \x1b[{row};{col}R = CPR (Cursor Position Report) responses
  if (
    input === "\x1b[O" ||
    input === "\x1b[I" ||
    input.startsWith("\x1b]") ||
    /^\x1b\[\d+;\d+R$/.test(input)
  ) {
    return;
  }

  Object.values(activeTab.panes).forEach((pane) => {
    if (pane.type !== "terminal" || pane.id === sourcePaneId) {
      return;
    }

    // Suppress echo detection for broadcast targets' upcoming output.
    // The source pane handles its own suppression in xtermCache.ts.
    notifyUserInput(pane.sessionId);
    api.sendKeypress(pane.sessionId, input);
  });
}
