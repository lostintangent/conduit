import { applicationModeAtom } from "@/store/atoms";
import { getDefaultStore } from "jotai";
import { activatePane } from "./pane";

const store = getDefaultStore();

export function isFocusModeActive(): boolean {
  return store.get(applicationModeAtom) === "focus";
}

export function enterFocusMode(tabId: string, paneId: string): void {
  activatePane(tabId, paneId);
  store.set(applicationModeAtom, "focus");
}

export function exitFocusMode(): void {
  store.set(applicationModeAtom, "normal");
}

export function toggleFocusMode(tabId: string, paneId: string): void {
  if (isFocusModeActive()) {
    exitFocusMode();
  } else {
    enterFocusMode(tabId, paneId);
  }
}
