/**
 * Hands the app its shortcuts while a page has focus.
 *
 * Keys pressed in a page go to the page's process, so the app's keybinding
 * dispatcher never sees them. The pane sends the page the keys that run
 * something in the app right now, and the page hands those back instead of
 * handling them. Everything else, including the keys pages need for editing,
 * stays with the page.
 */

import {
  clearPressedKeys,
  heldKeys,
  isModifierKey,
  matchesEvent,
  trackKeyDown,
  trackKeyUp,
} from "@/commands/keybindings/parser";
import type { KeyChord } from "@/commands/keybindings/types";
import { ipcRenderer } from "electron";

/** A key that runs something in the app */
export interface AppKey {
  chord: KeyChord;
  /** Whether it starts a two-part keybinding, like Cmd+K in Cmd+K Cmd+S */
  startsChord: boolean;
}

/** A key the page handed to the app, for its dispatcher to run */
export interface HandedKey {
  init: KeyboardEventInit;
  /** Keys held down with it, like "b" in Cmd+Shift+B+Left */
  held: string[];
}

// As long as the app's dispatcher waits for a chord's second part
const CHORD_TIMEOUT_MS = 1000;

let appKeys: AppKey[] = [];
let chordStartedAt = Number.NEGATIVE_INFINITY;

export function handAppKeys(): void {
  ipcRenderer.on("browser:app-keys", (_, keys: AppKey[]) => {
    appKeys = keys;
  });

  window.addEventListener(
    "keydown",
    (event) => {
      // A page's own scripts can't run the app's commands
      if (!event.isTrusted) return;
      trackKeyDown(event);
      if (isModifierKey(event.key)) return;

      // A chord's second part is the app's, whatever it is, as in VS Code
      const isChordPart = performance.now() - chordStartedAt < CHORD_TIMEOUT_MS;
      const appKey = appKeys.find(({ chord }) => matchesEvent(chord, event));
      if (!isChordPart && !appKey) return;

      chordStartedAt =
        !isChordPart && appKey?.startsChord
          ? performance.now()
          : Number.NEGATIVE_INFINITY;
      event.preventDefault();
      event.stopImmediatePropagation();
      const { key, code, ctrlKey, shiftKey, altKey, metaKey } = event;
      const handed: HandedKey = {
        init: { key, code, ctrlKey, shiftKey, altKey, metaKey },
        held: heldKeys(event),
      };
      ipcRenderer.sendToHost("browser:app-key", handed);
      // The app may take focus, so the page might not see the key come up.
      // The app's dispatcher forgets held keys after a command too.
      clearPressedKeys();
    },
    { capture: true },
  );
  window.addEventListener("keyup", trackKeyUp, { capture: true });
  window.addEventListener("blur", () => {
    clearPressedKeys();
    chordStartedAt = Number.NEGATIVE_INFINITY;
  });
}
