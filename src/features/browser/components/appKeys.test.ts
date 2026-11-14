import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
} from "@/commands";
import { ContextKey } from "@/commands/contextKeys/ContextKey";
import type { Disposable } from "@/commands/core/types";
import {
  heldKeys,
  matchesEvent,
  parseChord,
} from "@/commands/keybindings/parser";
import { USER_KEYBINDING_WEIGHT } from "@/commands/keybindings/types";
import type { WhenClause } from "@/commands/whenClauses/WhenClause";
import type { WebviewTag } from "electron";
import { getAppKeys, shareAppKeys } from "./appKeys";

const paneType = new ContextKey<string>("activePaneType", "");

/** The app keys, written the way keybindings are */
function appKeys() {
  return getAppKeys().map(({ chord, startsChord }) => {
    const modifiers = [
      chord.meta && "Cmd",
      chord.ctrl && "Ctrl",
      chord.alt && "Alt",
      chord.shift && "Shift",
    ].filter(Boolean);
    const key = [...modifiers, chord.key.toUpperCase()].join("+");
    return startsChord ? `${key} …` : key;
  });
}

describe("app keys", () => {
  let commands: Disposable[];

  const command = (id: string, key: string, when?: WhenClause) =>
    commands.push(
      getCommandRegistry().registerCommand({
        id,
        title: id,
        keybinding: { key },
        when,
        run: () => {},
      }),
    );

  beforeEach(() => {
    commands = [];
    getContextKeyService().setGlobal(paneType.key, "browser");
  });

  afterEach(() => {
    for (const registered of commands) registered.dispose();
    getKeybindingRegistry().clear();
    getContextKeyService().setGlobal(paneType.key, "");
  });

  describe("getAppKeys", () => {
    it("hands the app its keybindings and tab switching keys", () => {
      command("tab.new", "Cmd+T");

      expect(appKeys()).toEqual([
        ...Array.from({ length: 9 }, (_, index) => `Cmd+${index + 1}`),
        "Cmd+T",
      ]);
    });

    it("leaves a key whose command is off with the page", () => {
      command("editor.toggleSidebar", "Cmd+B", paneType.equals("editor"));
      expect(appKeys()).not.toContain("Cmd+B");

      getContextKeyService().setGlobal(paneType.key, "editor");
      expect(appKeys()).toContain("Cmd+B");
    });

    it("leaves a key with the page when the command it runs is off", () => {
      command("browser.thing", "Cmd+G");
      getKeybindingRegistry().register(
        "editor.thing",
        { key: "Cmd+G" },
        USER_KEYBINDING_WEIGHT,
      );
      command("editor.thing", "Cmd+Shift+G", paneType.equals("editor"));

      expect(appKeys()).not.toContain("Cmd+G");
    });

    it("leaves the page its editing keys unless the user binds them", () => {
      command("pane.navigateLeft", "Cmd+Left");
      command("pane.split", "Cmd+Shift+Left");
      command("copy.path", "Cmd+C");
      expect(appKeys()).not.toContain("Cmd+LEFT");
      expect(appKeys()).not.toContain("Cmd+Shift+LEFT");
      expect(appKeys()).not.toContain("Cmd+C");

      getKeybindingRegistry().register(
        "copy.path",
        { key: "Cmd+C" },
        USER_KEYBINDING_WEIGHT,
      );
      expect(appKeys()).toContain("Cmd+C");
    });

    it("hands over a chord's first key even when its command is off, since the app waits for the second", () => {
      command("workspace.open", "Cmd+K Cmd+O", paneType.equals("editor"));
      command("workspace.save", "Cmd+K Cmd+W");

      expect(appKeys().filter((key) => key.startsWith("Cmd+K"))).toEqual([
        "Cmd+K …",
      ]);
    });
  });

  describe("shareAppKeys", () => {
    let webview: EventTarget & { send: ReturnType<typeof vi.fn> };
    let stop: () => void;

    beforeEach(() => {
      webview = Object.assign(new EventTarget(), {
        send: vi.fn(() => Promise.resolve()),
      });
    });

    afterEach(() => stop());

    const share = () => {
      stop = shareAppKeys(webview as unknown as WebviewTag);
    };

    const sentKeys = () =>
      webview.send.mock.calls.map(([, keys]) =>
        (keys as { chord: { key: string } }[]).map(({ chord }) => chord.key),
      );

    it("sends a page new keys when their commands turn on, and every new page", async () => {
      command("editor.toggleSidebar", "Cmd+B", paneType.equals("editor"));
      share();
      expect(sentKeys().at(-1)).not.toContain("b");

      getContextKeyService().setGlobal(paneType.key, "editor");
      await Promise.resolve();
      expect(sentKeys().at(-1)).toContain("b");

      getContextKeyService().setGlobal("tabCount", 2);
      await Promise.resolve();
      expect(sentKeys()).toHaveLength(2);

      webview.dispatchEvent(new Event("dom-ready"));
      expect(sentKeys()).toHaveLength(3);
    });

    it("runs a handed key as if it were pressed in the app", () => {
      share();
      const pressed: boolean[] = [];
      const listener = (event: KeyboardEvent) =>
        pressed.push(matchesEvent(parseChord("Cmd+Shift+B+Left"), event));
      window.addEventListener("keydown", listener);

      webview.dispatchEvent(
        Object.assign(new Event("ipc-message"), {
          channel: "browser:app-key",
          args: [
            {
              init: { key: "ArrowLeft", metaKey: true, shiftKey: true },
              held: ["b"],
            },
          ],
        }),
      );
      window.removeEventListener("keydown", listener);

      expect(pressed).toEqual([true]);
      // Its keys come up in the page, so the app forgets them
      expect(heldKeys(new KeyboardEvent("keydown", { key: "x" }))).toEqual([]);
    });
  });
});
