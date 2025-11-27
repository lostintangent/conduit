import {
  defaultFontFamily,
  defaultFontSize,
} from "@/components/shell/TerminalFontSettingsDialog";
import { resolveColor } from "@/utils/theme";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon, type ISerializeOptions } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import path from "node:path";

import chimeUrl from "@/assets/chime.mp3";
import { UserSettings } from "@shared/types";
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
  setInputHandler: (handler: ((input: string) => void) | null) => void;
  setCwdHandler: (handler: ((cwd: string | null) => void) | null) => void;
  setTitleHandler: (handler: ((title: string) => void) | null) => void;
  markReady: () => void;
  resize: (cols: number, rows: number) => void;
  dispose: () => void;
};

const api = window.conduit;
const store = new Map<string, TerminalInstance>();

type GetOrCreateOptions = {
  onLinkClick?: (url: string) => void;
  onInput?: (input: string) => void;
  onCwdChange?: (cwd: string | null) => void;
  onTitleChange?: (title: string) => void;
};

const normalizeCwd = (raw: string | null): string | null => {
  if (!raw) {
    return null;
  }

  const stripped = raw.replace(/^file:\/\//, "");
  const slashIndex = stripped.indexOf("/");
  const pathPortion = slashIndex >= 0 ? stripped.slice(slashIndex) : stripped;

  let decoded = pathPortion;
  try {
    decoded = decodeURIComponent(pathPortion);
  } catch {
    decoded = pathPortion;
  }

  const sanitized = decoded.split("\u0007").join("").trim();
  if (!sanitized) {
    return null;
  }

  try {
    return path.normalize(sanitized);
  } catch {
    return sanitized;
  }
};

export function getOrCreate(
  sessionId: string,
  userSettings: UserSettings,
  options: GetOrCreateOptions = {},
): TerminalInstance {
  let instance = store.get(sessionId);
  if (!instance) {
    const terminalTheme = {
      background: resolveColor("background"),
      foreground: resolveColor("foreground"),
      cursor: resolveColor("foreground"),
      selectionBackground: resolveColor("selection"),
    };

    const fontFamily = userSettings.terminalFontFamily ?? defaultFontFamily;
    const fontSize = userSettings.terminalFontSize ?? defaultFontSize;

    const terminal = new Terminal({
      fontFamily,
      fontSize,
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
    const inputHandlerRef: { current: ((input: string) => void) | null } = {
      current: options.onInput ?? null,
    };
    const cwdHandlerRef: { current: ((cwd: string | null) => void) | null } = {
      current: options.onCwdChange ?? null,
    };
    const titleHandlerRef: { current: ((title: string) => void) | null } = {
      current: options.onTitleChange ?? null,
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

    const osc7Disposable = terminal.parser.registerOscHandler(7, (data) => {
      const cwd = normalizeCwd(data ?? null);
      cwdHandlerRef.current?.(cwd);
      return false;
    });

    const titleDisposable = terminal.onTitleChange((title) => {
      titleHandlerRef.current?.(title);
    });

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

    const onDataDispose = terminal.onData((input) => {
      api.sendKeypress(sessionId, input);
      inputHandlerRef.current?.(input);
    });

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
      setInputHandler: (handler) => {
        inputHandlerRef.current = handler;
      },
      setCwdHandler: (handler) => {
        cwdHandlerRef.current = handler;
      },
      setTitleHandler: (handler) => {
        titleHandlerRef.current = handler;
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
        onDataDispose?.dispose();
        osc7Disposable.dispose();
        titleDisposable.dispose();
        terminal.dispose();
        linkHandlerRef.current = null;
        inputHandlerRef.current = null;
        cwdHandlerRef.current = null;
        titleHandlerRef.current = null;
        newInstance.ready = false;
        serializer.dispose();
      },
      serializer,
    };
    store.set(sessionId, newInstance);
    instance = newInstance;
  } else {
    if (options.onLinkClick) {
      instance.setLinkHandler(options.onLinkClick);
    }
    if ("onInput" in options) {
      instance.setInputHandler(options.onInput ?? null);
    }
    if ("onCwdChange" in options) {
      instance.setCwdHandler(options.onCwdChange ?? null);
    }
    if ("onTitleChange" in options) {
      instance.setTitleHandler(options.onTitleChange ?? null);
    }
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
    background: resolveColor("background"),
    foreground: resolveColor("foreground"),
    cursor: resolveColor("foreground"),
    selectionBackground: resolveColor("selection"),
  };

  store.forEach((instance) => {
    instance.terminal.options.theme = terminalTheme;
  });
}

/**
 * Update terminal fonts for all active terminals
 * Called when the terminal font settings change
 */
export function updateTerminalFonts(fontFamily: string, fontSize: number) {
  store.forEach((instance) => {
    instance.terminal.options.fontFamily = fontFamily;
    instance.terminal.options.fontSize = fontSize;
  });
}

/**
 * Get the last N lines of terminal buffer for a session
 * Used for terminal prompt mode to provide context to the LLM
 */
export function getTerminalBuffer(
  sessionId: string,
  lines = 100,
): string | null {
  const instance = store.get(sessionId);
  if (!instance) {
    return null;
  }

  try {
    const fullBuffer = instance.serializer.serialize();
    const bufferLines = fullBuffer.split("\n");
    const lastNLines = bufferLines.slice(-lines);
    return lastNLines.join("\n");
  } catch (error) {
    console.error("Failed to capture terminal buffer", error);
    return null;
  }
}
