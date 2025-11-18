import { activeTabAtom } from "@/store/atoms";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();
const api = window.conduit;

export function broadcastTerminalInput(sourcePaneId: string, input: string) {
  const activeTab = store.get(activeTabAtom);
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
  if (input === "\x1b[O" || input === "\x1b[I" || input.startsWith("\x1b]")) {
    return;
  }

  Object.values(activeTab.panes).forEach((pane) => {
    if (pane.type !== "terminal" || pane.id === sourcePaneId) {
      return;
    }

    api.sendKeypress(pane.sessionId, input);
  });
}
