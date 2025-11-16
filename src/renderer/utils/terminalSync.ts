import { activeTabAtom } from "@/store/atoms";
import type { Pane, TerminalPane as TerminalPaneType } from "@/types";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();
const api = window.conduit;

function isTerminalPane(pane: Pane): pane is TerminalPaneType {
  return pane.type === "terminal";
}

export function broadcastTerminalInput(sourcePaneId: string, input: string) {
  const activeTab = store.get(activeTabAtom);
  if (!activeTab || !activeTab.isSynchronized) {
    return;
  }

  if (activeTab.activePaneId !== sourcePaneId) {
    return;
  }

  Object.values(activeTab.panes).forEach((pane) => {
    if (!isTerminalPane(pane) || pane.id === sourcePaneId) {
      return;
    }

    api.sendKeypress(pane.sessionId, input);
  });
}
