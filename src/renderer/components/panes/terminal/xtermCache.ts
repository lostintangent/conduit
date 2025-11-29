import {
  defaultFontFamily,
  defaultFontSize,
} from "@/components/shell/TerminalFontSettingsDialog";
import { resolveColor } from "@/utils/theme";
import { UserSettings } from "@shared/types";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon, type ISerializeOptions } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";

const api = window.conduit;

export type xtermInstance = {
  terminal: Terminal;

  fit: FitAddon;
  search: SearchAddon;
  serializer: SerializeAddon;

  setLinkHandler: (handler: ((url: string) => void) | null) => void;
  setInputHandler: (handler: ((input: string) => void) | null) => void;

  ready: boolean;
  markReady: () => void;

  resize: (cols: number, rows: number) => void;
  dispose: () => void;
};

// Map of pane IDs to their xterm terminal instances, which allows
// us to reuse terminal instances when panes are moved around.
const xtermInstancesByPane = new Map<string, xtermInstance>();

// Map of the panes that are associated with each terminal session. For
// the most part, there is a 1:1 mapping between terminal sessions and panes,
// but cloned terminals will share the same session ID.
const panesBySession = new Map<string, Set<string>>();

const sessionDataSubscriptions = new Map<string, { unsubscribe: () => void }>();

/**
 * Copy the terminal buffer from an existing pane to a new terminal instance.
 * This is used when cloning terminals to preserve the current state.
 *
 * @param sessionId The ID of the terminal session
 * @param targetTerminal The target terminal instance to copy the buffer into (if needed)
 */
function restoreTerminalBuffer(
  sessionId: string,
  targetTerminal: Terminal,
): void {
  const existingPanes = panesBySession.get(sessionId);
  if (!existingPanes) return;

  const existingPaneId = Array.from(existingPanes)[0];
  const existingInstance = xtermInstancesByPane.get(existingPaneId);

  if (existingInstance) {
    let buffer = existingInstance.serializer.serialize();

    // The serialize addon doesn't currently preserve cursor visibility state
    // so we need to rely on an internal property and then manaully hide/show
    // the cursor in cloned terminals. Otherwise, cloned TUIs might show a cursor
    // when they intended to hide it. See https://github.com/xtermjs/xterm.js/issues/3364
    const { isCursorHidden } = (existingInstance.terminal as any)._core
      ._inputHandler._coreService;
    buffer += isCursorHidden ? "\x1b[?25l" : "\x1b[?25h";

    targetTerminal.write(buffer);
  }
}

/**
 * Get or create a terminal instance for a given session and pane.
 *
 * @param sessionId The ID of the terminal session
 * @param paneId The ID of the pane the terminal is being attached to
 * @param userSettings The user settings to configure the terminal with
 */
export function getOrCreate(
  sessionId: string,
  paneId: string,
  userSettings: UserSettings,
): xtermInstance {
  // Check if we've already created an xterm instance for this pane
  // and can simply re-use it. This will be the case when moving panes around.
  let instance = xtermInstancesByPane.get(paneId);

  // If the xterm instance doesn't already exist, then create it.
  if (!instance) {
    // Resolve the color theme and font settings
    const theme = {
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
      theme,
      cursorBlink: true,
      scrollback: 2000,
      allowProposedApi: true, // Required for us to use the decorations API (for displaying search results in the terminal)
      allowTransparency: false,
    });

    // Initialize and load xterm addons
    const fit = new FitAddon();
    const search = new SearchAddon();
    const serializer = new SerializeAddon();

    const linkHandlerRef: { current: ((url: string) => void) | null } = {
      current: null,
    };
    const inputHandlerRef: { current: ((input: string) => void) | null } = {
      current: null,
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

    // If this is the first pane that's associated
    // with this PTY session, then set up the data handling.
    if (!panesBySession.has(sessionId)) {
      let writeBuffer: string[] = [];
      let flushTimer: NodeJS.Timeout | null = null;

      const flushWrites = () => {
        flushTimer = null;

        if (writeBuffer.length === 0) return;

        const panes = panesBySession.get(sessionId);
        if (panes) {
          panes.forEach((paneId) => {
            const inst = xtermInstancesByPane.get(paneId);
            if (inst) {
              inst.terminal.write(writeBuffer.join(""));
            }
          });
        }

        writeBuffer = [];
      };

      //
      const unsubscribe = api.onData(sessionId, (data: string) => {
        writeBuffer.push(data);
        if (flushTimer === null) {
          flushTimer = setTimeout(flushWrites, 20);
        }
      });

      sessionDataSubscriptions.set(sessionId, { unsubscribe });
      panesBySession.set(sessionId, new Set());
    } else {
      // Since there are existing panes for this session, then this must
      // be a cloned terminal, and we need to restore the terminal buffer state.
      restoreTerminalBuffer(sessionId, terminal);
    }

    panesBySession.get(sessionId).add(paneId);

    const onDataDispose = terminal.onData((input) => {
      api.sendKeypress(sessionId, input);
      inputHandlerRef.current?.(input);
    });

    const newInstance: xtermInstance = {
      terminal,
      fit,
      search,
      serializer,
      ready: false,
      setLinkHandler: (handler) => {
        linkHandlerRef.current = handler;
      },
      setInputHandler: (handler) => {
        inputHandlerRef.current = handler;
      },
      markReady: () => {
        if (newInstance.ready) return;

        newInstance.ready = true;
        api.markTerminalReady(sessionId);
      },
      resize: (cols, rows) => api.resize(sessionId, cols, rows),
      dispose: () => {
        // Dispose the xterm instance and all its resources/addons
        terminal.dispose();
        onDataDispose.dispose();

        // Clean up subscription if no more panes
        const panes = panesBySession.get(sessionId);
        panes?.delete(paneId);

        if (!panes || panes.size === 0) {
          panesBySession.delete(sessionId);

          const dataSubscription = sessionDataSubscriptions.get(sessionId);
          dataSubscription?.unsubscribe();

          sessionDataSubscriptions.delete(sessionId);
        }
      },
    };

    xtermInstancesByPane.set(paneId, newInstance);
    instance = newInstance;
  }

  return instance;
}

export function attach(paneId: string, container: HTMLElement) {
  const instance = xtermInstancesByPane.get(paneId);
  if (!instance) return;

  const element = instance.terminal.element as HTMLElement | null;
  if (element && element.parentElement !== container) {
    container.appendChild(element);
  } else {
    instance.terminal.open(container);
  }
}

/**
 * Resolves a terminal instance from either a sessionId or paneId.
 * First checks if the ID is directly in the store (paneId),
 * then checks if it's a sessionId and finds any pane using that session.
 *
 * @param sessionOrPaneId Either a session ID or pane ID
 * @returns The terminal instance, or null if not found
 */
function resolveTerminalInstance(
  sessionOrPaneId: string,
): xtermInstance | null {
  // Check if it's directly in the store (paneId)
  let instance = xtermInstancesByPane.get(sessionOrPaneId);

  // If not found, look for any pane that has this sessionId
  if (!instance) {
    const panes = panesBySession.get(sessionOrPaneId);
    if (panes && panes.size > 0) {
      const paneId = Array.from(panes)[0];
      instance = xtermInstancesByPane.get(paneId);
    }
  }

  return instance || null;
}

function disposePaneInstance(paneId: string) {
  const instance = xtermInstancesByPane.get(paneId);
  if (!instance) return;

  instance.dispose();
  xtermInstancesByPane.delete(paneId);
}

/**
 * Dispose a terminal instance by session or pane id.
 * If given a session id, disposes all pane instances for that session.
 */
export function disposeSession(sessionOrPaneId: string) {
  const panesForSession = panesBySession.get(sessionOrPaneId);
  if (panesForSession && panesForSession.size > 0) {
    Array.from(panesForSession).forEach(disposePaneInstance);
    return;
  }

  disposePaneInstance(sessionOrPaneId);
}

/**
 * Serializes the contents of a terminal session.
 * Since multiple panes can share the same session (cloned terminals),
 * this finds any pane with the given sessionId and serializes its buffer.
 *
 * @param sessionOrPaneId The ID of the terminal session or pane to serialize
 * @param options Serialization options
 * @returns The string contents of the terminal, or null if the session does not exist
 */
export function serializeSession(
  sessionOrPaneId: string,
  options?: ISerializeOptions,
): string | null {
  const instance = resolveTerminalInstance(sessionOrPaneId);
  if (!instance) return null;
  return instance.serializer.serialize(options);
}

/**
 * Sends input to the specified terminal session or pane.
 * @param sessionOrPaneId The ID of the terminal session or pane to send input to
 * @param input The input string to send to the terminal
 * @returns True if the input was sent successfully, false if the session does not exist
 */
export function inputToSession(
  sessionOrPaneId: string,
  input: string,
): boolean {
  const instance = resolveTerminalInstance(sessionOrPaneId);
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

  xtermInstancesByPane.forEach((instance) => {
    instance.terminal.options.theme = terminalTheme;
  });
}

/**
 * Update terminal fonts for all active terminals
 * Called when the terminal font settings change
 */
export function updateTerminalFonts(fontFamily: string, fontSize: number) {
  xtermInstancesByPane.forEach((instance) => {
    instance.terminal.options.fontFamily = fontFamily;
    instance.terminal.options.fontSize = fontSize;
  });
}
