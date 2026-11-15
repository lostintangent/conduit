import {
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
} from "@/commands";
import {
  clearPressedKeys,
  isSameChord,
  parseChord,
  trackKeyDown,
} from "@/commands/keybindings/parser";
import { isUserKeybinding } from "@/commands/keybindings/types";
import { keybindingsAtom } from "@features/workbench/client/atoms";
import type { IpcMessageEvent, WebviewTag } from "electron";
import type { AppKey, HandedKey } from "../preload/appKeys";

// Keys pages need, which stay with the page unless the user binds the key on
// its own: select all, copy, cut, paste, undo and redo, moving the caret or
// selecting to the edge of a line or the page, and the search many sites open
// with Cmd+K
const PAGE_KEYS = [
  "Cmd+K",
  "Cmd+A",
  "Cmd+C",
  "Cmd+X",
  "Cmd+V",
  "Cmd+Z",
  "Cmd+Shift+Z",
  ...["Left", "Right", "Up", "Down"].flatMap((arrow) => [
    `Cmd+${arrow}`,
    `Cmd+Shift+${arrow}`,
  ]),
].map(parseChord);

// Find, which a page with its own, like a document editor, keeps for itself.
// The page does nothing with them otherwise, so the app gets them then.
const PAGE_FIRST_KEYS = ["Cmd+F", "Cmd+G", "Cmd+Shift+G"].map(parseChord);

// The keybinding dispatcher switches tabs with these itself
const TAB_KEYS = Array.from({ length: 9 }, (_, index) =>
  parseChord(`Cmd+${index + 1}`),
);

/**
 * The keys that run something in the app right now, picked the way the
 * keybinding dispatcher picks what a key does
 */
export function getAppKeys(): AppKey[] {
  const commands = getCommandRegistry();
  const keys: AppKey[] = TAB_KEYS.map((chord) => ({
    chord,
    startsChord: false,
  }));
  for (const {
    chord,
    binding,
    startsChord,
  } of getKeybindingRegistry().getFirstChords()) {
    const isUserKey = !!binding && isUserKeybinding(binding);
    const isPageKey = PAGE_KEYS.some((key) => isSameChord(key, chord));
    if (isPageKey && !isUserKey) continue;
    if (
      startsChord ||
      (binding && commands.isCommandEnabled(binding.commandId))
    ) {
      const pageFirst =
        !isUserKey && PAGE_FIRST_KEYS.some((key) => isSameChord(key, chord));
      keys.push(
        pageFirst ? { chord, startsChord, pageFirst } : { chord, startsChord },
      );
    }
  }
  return keys;
}

/** Runs a key a page handed over, as if it had been pressed in the app */
function runHandedKey({ init, held }: HandedKey) {
  clearPressedKeys();
  for (const key of held) {
    trackKeyDown(new KeyboardEvent("keydown", { key }));
  }
  window.dispatchEvent(
    new KeyboardEvent("keydown", { ...init, cancelable: true }),
  );
  // The key comes up in the page, so the app wouldn't see it released
  clearPressedKeys();
}

/**
 * Keeps a webview's pages up to date on the app's keys, and runs the ones they
 * hand back. Returns a function that stops.
 */
export function shareAppKeys(webview: WebviewTag): () => void {
  let sent: string | undefined;
  const send = () => {
    const keys = getAppKeys();
    const json = JSON.stringify(keys);
    if (json === sent) return;
    try {
      webview.send("browser:app-keys", keys).catch(() => {});
      sent = json;
    } catch {
      // Not attached yet. Its page asks for them as it starts.
    }
  };

  // Many context keys change together, so send once they're done
  let isSendScheduled = false;
  const scheduleSend = () => {
    if (isSendScheduled) return;
    isSendScheduled = true;
    queueMicrotask(() => {
      isSendScheduled = false;
      send();
    });
  };

  const handleIpcMessage = ({ channel, args }: IpcMessageEvent) => {
    // Each page the webview loads asks for them as it starts
    if (channel === "browser:get-app-keys") {
      sent = undefined;
      send();
    }
    if (channel === "browser:app-key") runHandedKey(args[0] as HandedKey);
  };

  webview.addEventListener("ipc-message", handleIpcMessage);
  const stopWatchingContext =
    getContextKeyService().onDidChangeContext(scheduleSend);
  const keybindings = keybindingsAtom.subscribe(scheduleSend);
  send();

  return () => {
    webview.removeEventListener("ipc-message", handleIpcMessage);
    stopWatchingContext();
    keybindings.unsubscribe();
  };
}
