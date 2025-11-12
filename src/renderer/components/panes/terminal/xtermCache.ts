import { resolveColor } from "@/utils/theme";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon, type ISerializeOptions } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";

import chimeUrl from "@/assets/chime.mp3";
const bellAudio = new Audio(chimeUrl);
bellAudio.preload = "auto";
bellAudio.load();

export type TerminalInstance = {
  terminal: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  serializer: SerializeAddon;

  ready: boolean;
  setLinkHandler: (handler: ((url: string) => void) | null) => void;
  markReady: () => void;
  resize: (cols: number, rows: number) => void;
  dispose: () => void;
};

const api = window.conduit;
const store = new Map<string, TerminalInstance>();

type GetOrCreateOptions = {
  onLinkClick?: (url: string) => void;
};

export function getOrCreate(
  sessionId: string,
  options: GetOrCreateOptions = {},
): TerminalInstance {
  let instance = store.get(sessionId);
  if (!instance) {
    const terminalTheme = {
      background: resolveColor("surface"),
      foreground: resolveColor("foreground"),
      cursor: resolveColor("foreground"),
      selectionBackground: resolveColor("selection"),
    };

    const terminal = new Terminal({
      fontFamily: "Fira Code, Menlo, monospace",
      fontSize: 14,
      cursorBlink: true,
      scrollback: 2000,
      allowProposedApi: true, // Required for us to use the decorations API (for displaying search results in the terminal)
      theme: terminalTheme,
      allowTransparency: false,
    });

    const fit = new FitAddon();
    const search = new SearchAddon();
    const serializer = new SerializeAddon();
    const linkHandlerRef: { current: ((url: string) => void) | null } = {
      current: options.onLinkClick,
    };

    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      const handler = linkHandlerRef.current;
      if (handler) {
        handler(uri);
        return;
      }
      api.openExternal(uri);
    });

    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(serializer);

    // Batch writes with a small delay to prevent cursor flicker in TUIs
    let writeBuffer: string[] = [];
    let flushTimer: NodeJS.Timeout | null = null;

    const flushWrites = () => {
      flushTimer = null;
      if (writeBuffer.length > 0) {
        terminal.write(writeBuffer.join(""));
        writeBuffer = [];
      }
    };

    const unsubData = api.onData(sessionId, (data: string) => {
      writeBuffer.push(data);
      if (flushTimer === null) {
        flushTimer = setTimeout(flushWrites, 20);
      }
    });

    const onKeyDispose = terminal.onData((input) =>
      api.sendKeypress(sessionId, input),
    );

    // TODO: Allow configuring this
    //terminal.onBell(() => bellAudio.play());

    const newInstance: TerminalInstance = {
      terminal,
      fit,
      search,
      ready: false,
      setLinkHandler: (handler) => {
        linkHandlerRef.current = handler;
      },
      markReady: () => {
        if (newInstance.ready) return;

        newInstance.ready = true;
        api.markTerminalReady(sessionId);
      },
      resize: (cols, rows) => {
        api.resize(sessionId, cols, rows);
      },
      dispose: () => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        writeBuffer = [];
        unsubData();
        onKeyDispose?.dispose();
        terminal.dispose();
        linkHandlerRef.current = null;
        newInstance.ready = false;
        serializer.dispose();
      },
      serializer,
    };
    store.set(sessionId, newInstance);
    instance = newInstance;
  } else if (options.onLinkClick) {
    instance.setLinkHandler(options.onLinkClick);
  }

  return instance;
}

export function attach(sessionId: string, container: HTMLElement) {
  const instance = store.get(sessionId);
  if (!instance) return;

  const element = instance.terminal.element as HTMLElement | null;
  if (element && element.parentElement !== container) {
    container.appendChild(element);
  } else {
    instance.terminal.open(container);
  }
}

export function disposeSession(sessionId: string) {
  const instance = store.get(sessionId);
  if (!instance) return;

  instance.dispose();
  store.delete(sessionId);
}

export function serializeSession(
  sessionId: string,
  options?: ISerializeOptions,
): string | null {
  const instance = store.get(sessionId);
  if (!instance) return null;

  try {
    return instance.serializer.serialize(options);
  } catch (error) {
    console.error("Failed to serialize terminal session", error);
    return null;
  }
}

export function inputToSession(sessionId: string, input: string): boolean {
  const instance = store.get(sessionId);
  if (!instance) return false;

  instance.terminal.input(input);
  return true;
}

/**
 * Update terminal theme for all active terminals
 * Called when the app theme changes
 */
export function updateTerminalThemes() {
  const terminalTheme = {
    background: resolveColor("surface"),
    foreground: resolveColor("foreground"),
    cursor: resolveColor("foreground"),
    selectionBackground: resolveColor("selection"),
  };

  store.forEach((instance) => {
    instance.terminal.options.theme = terminalTheme;
  });
}
