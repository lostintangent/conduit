import { applicationModeAtom } from "@/store/atoms";
import { activatePane } from "./pane";

export function isFocusModeActive(): boolean {
  return applicationModeAtom.get() === "focus";
}

export function enterFocusMode(tabId: string, paneId: string): void {
  activatePane(tabId, paneId);
  applicationModeAtom.set("focus");
}

export function exitFocusMode(): void {
  applicationModeAtom.set("normal");
}

export function toggleFocusMode(tabId: string, paneId: string): void {
  if (isFocusModeActive()) {
    exitFocusMode();
  } else {
    enterFocusMode(tabId, paneId);
  }
}
