import {
  applicationModeAtom,
  setApplicationMode,
} from "@features/workbench/client/atoms";
import { activatePane } from "./pane";

export function isFocusModeActive(): boolean {
  return applicationModeAtom.get() === "focus";
}

export function enterFocusMode(tabId: string, paneId: string): void {
  activatePane(tabId, paneId);
  setApplicationMode("focus");
}

export function exitFocusMode(): void {
  setApplicationMode("normal");
}

export function toggleFocusMode(tabId: string, paneId: string): void {
  if (isFocusModeActive()) {
    exitFocusMode();
  } else {
    enterFocusMode(tabId, paneId);
  }
}
