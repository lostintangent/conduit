import { tabsAtom } from "@/store/atoms";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();
const api = window.conduit;

export function broadcastTerminalInput(
  tabId: string | undefined,
  sourceSessionId: string,
  input: string,
) {
  if (!tabId) {
    return;
  }

  const tabs = store.get(tabsAtom);
  const tab = tabs.find((currentTab) => currentTab.id === tabId);
  if (!tab || !tab.isSynchronized) {
    return;
  }

  Object.values(tab.panes).forEach((pane) => {
    if (pane.type !== "terminal") {
      return;
    }

    if (pane.sessionId === sourceSessionId) {
      return;
    }

    api.sendKeypress(pane.sessionId, input);
  });
}
