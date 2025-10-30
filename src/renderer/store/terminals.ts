import { resolveColor } from "@/utils/theme";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";

export type TerminalInstance = {
  terminal: Terminal;
  fit: FitAddon;
  search: SearchAddon;

  ready: boolean;
  setLinkHandler: (handler: ((url: string) => void) | null) => void;
  dispose: () => void;
};

const api = window.conduit;
const store = new Map<string, TerminalInstance>();

type GetOrCreateOptions = {
  onLinkClick?: (url: string) => void;
};

export function getOrCreate(
  sessionId: string,
  options: GetOrCreateOptions = {}
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
    const linkHandlerRef: { current: ((url: string) => void) | null } = {
      current: options.onLinkClick
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

    const unsubData = api.onData(sessionId, (data: string) =>
      terminal.write(data)
    );

    const onKeyDispose = terminal.onData((input) =>
      api.sendKeypress(sessionId, input)
    );

    instance = {
      terminal,
      fit,
      search,
      ready: false,
      setLinkHandler: (handler) => {
        linkHandlerRef.current = handler;
      },
      dispose: () => {
        unsubData();
        onKeyDispose?.dispose();
        terminal.dispose();
        linkHandlerRef.current = null;
      },
    };
    store.set(sessionId, instance);
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

export function markReadyOnce(
  sessionId: string,
  api: typeof window.conduit
) {
  const instance = store.get(sessionId);
  if (!instance || instance.ready) return;

  instance.ready = true;
  api.markTerminalReady(sessionId);
}

export function disposeSession(sessionId: string) {
  const instance = store.get(sessionId);
  if (!instance) return;

  instance.dispose();
  store.delete(sessionId);
}
