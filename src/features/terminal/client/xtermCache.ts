import { updateTerminalSessionProperty } from "@/store/actions/pane";
import { resolveColor } from "@/utils/theme";
import { UserSettings } from "@shared/types";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon, type ISerializeOptions } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import * as stateTracker from "./stateTracker";

const api = window.conduit;

// VS Code-matched ANSI color palettes for terminal output.
// These ensure that CLI tools using ANSI colors render with
// the same brightness/contrast as VS Code's integrated terminal.
const DARK_ANSI_COLORS = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

const LIGHT_ANSI_COLORS = {
  black: "#000000",
  red: "#cd3131",
  green: "#107c10",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};

function getTerminalTheme() {
  return {
    background: resolveColor("background"),
    foreground: resolveColor("foreground"),
    cursor: resolveColor("foreground"),
    selectionBackground: resolveColor("selection"),
    overviewRulerBorder: resolveColor("border"),
    ...(document.documentElement.dataset.theme === "light"
      ? LIGHT_ANSI_COLORS
      : DARK_ANSI_COLORS),
  };
}

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

// Pattern to extract file path from OSC 7 file:// URL format
// Format: file://hostname/path BEL (hostname may be empty)
// eslint-disable-next-line no-control-regex
const OSC_CWD_PATTERN = /^file:\/\/[^/]*(\/.*)$/;

// Map of pane IDs to their xterm terminal instances, which allows
// us to reuse terminal instances when panes are moved around.
const xtermInstancesByPane = new Map<string, xtermInstance>();

// Map of the panes that are associated with each terminal session. For
// the most part, there is a 1:1 mapping between terminal sessions and panes,
// but cloned terminals will share the same session ID.
const panesBySession = new Map<string, Set<string>>();

// Output for every session arrives on one `terminal.on("data")` listener and
// is dispatched here by session, so each chunk crosses contextBridge once
// however many terminals are open.
const sessionDataHandlers = new Map<string, (data: string) => void>();
let dataSubscription: (() => void) | undefined;

function onSessionData(sessionId: string, handler: (data: string) => void) {
  sessionDataHandlers.set(sessionId, handler);
  dataSubscription ??= api.terminal.on("data", ({ sessionId, data }) =>
    sessionDataHandlers.get(sessionId)?.(data),
  );
}

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
    const theme = getTerminalTheme();

    const fontFamily = userSettings.terminalFontFamily!;
    const fontSize = userSettings.terminalFontSize!;

    const terminal = new Terminal({
      fontFamily,
      fontSize,
      theme,
      cursorBlink: true,
      allowProposedApi: true, // Required for us to use the decorations API (for displaying search results in the terminal)
      allowTransparency: false,
    });

    // Initialize and load xterm addons
    const fit = new FitAddon();
    const search = new SearchAddon();
    const serializer = new SerializeAddon();
    const unicode11 = new Unicode11Addon();

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
    terminal.loadAddon(unicode11);

    // Activate Unicode 11 support
    terminal.unicode.activeVersion = "11";

    // If this is the first pane for this PTY session, set up data handling
    if (!panesBySession.has(sessionId)) {
      // Initialize state for this session
      panesBySession.set(sessionId, new Set());
      stateTracker.trackSession(sessionId);

      // Buffer writes to batch them for performance
      let writeBuffer: string[] = [];
      let flushTimer: NodeJS.Timeout | null = null;

      const flushWrites = () => {
        flushTimer = null;
        if (writeBuffer.length === 0) return;

        const panes = panesBySession.get(sessionId);
        panes?.forEach((paneId) => {
          xtermInstancesByPane
            .get(paneId)
            ?.terminal.write(writeBuffer.join(""));
        });
        writeBuffer = [];
      };

      onSessionData(sessionId, (data) => {
        writeBuffer.push(data);
        if (flushTimer === null) {
          flushTimer = setTimeout(flushWrites, 20);
        }

        // Notify state tracker of activity
        stateTracker.notifyDataReceived(sessionId);
      });
    } else {
      // Since there are existing panes for this session, then this must
      // be a cloned terminal, and we need to restore the terminal buffer state.
      restoreTerminalBuffer(sessionId, terminal);
    }

    panesBySession.get(sessionId)!.add(paneId);

    const onDataDispose = terminal.onData((input) => {
      // Suppress echo detection for this terminal's upcoming output.
      // See also: synchronizeInput.ts which does the same for broadcast targets.
      stateTracker.notifyUserInput(sessionId);
      api.terminal.input(sessionId, input);
      inputHandlerRef.current?.(input);
    });

    // Register OSC 7 handler for CWD changes
    // OSC 7 format: ESC ] 7 ; file://hostname/path BEL
    // We store the last known CWD to avoid redundant updates
    let lastKnownCwd: string | null = null;
    const osc7Disposable = terminal.parser.registerOscHandler(7, (data) => {
      const match = OSC_CWD_PATTERN.exec(data);
      if (match && match[1]) {
        // URL decode the path to handle special characters
        let cwd: string;
        try {
          cwd = decodeURIComponent(match[1]);
        } catch {
          cwd = match[1];
        }
        // On Windows, file:// URLs have paths like /C:/path - strip the leading slash
        if (/^\/[A-Za-z]:/.test(cwd)) {
          cwd = cwd.slice(1);
        }
        if (cwd !== lastKnownCwd) {
          lastKnownCwd = cwd;
          updateTerminalSessionProperty(sessionId, { cwd });
        }
      }
      return true; // Indicate the OSC was handled
    });

    // Register OSC 9 handler for progress state (Windows Terminal extension)
    // OSC 9;4 format: ESC ] 9 ; 4 ; <state> ; <progress> BEL
    // States: 0=hidden, 1=default, 2=error, 3=indeterminate, 4=warning
    const osc9Disposable = terminal.parser.registerOscHandler(9, (data) => {
      // Parse "4;<state>;<progress>" format
      const match = /^4;(\d+);(\d+)$/.exec(data);
      if (match) {
        const stateNum = parseInt(match[1], 10);
        const percent = parseInt(match[2], 10);
        stateTracker.updateProgressState(sessionId, stateNum, percent);
      }
      return true;
    });

    // Register onTitleChange handler for terminal title updates
    // This is triggered by OSC 0, 1, or 2 sequences from the shell
    const onTitleChangeDisposable = terminal.onTitleChange((newTitle) => {
      if (newTitle) {
        updateTerminalSessionProperty(sessionId, { title: newTitle });
      }
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
        api.terminal.ready(sessionId);
      },
      resize: (cols, rows) => api.terminal.resize(sessionId, cols, rows),
      dispose: () => {
        osc7Disposable.dispose();
        osc9Disposable.dispose();
        onTitleChangeDisposable.dispose();

        terminal.dispose();
        onDataDispose.dispose();

        // Clean up subscription if no more panes
        const panes = panesBySession.get(sessionId);
        panes?.delete(paneId);

        if (!panes || panes.size === 0) {
          panesBySession.delete(sessionId);

          sessionDataHandlers.delete(sessionId);

          stateTracker.untrackSession(sessionId);
        }
      },
    };

    xtermInstancesByPane.set(paneId, newInstance);
    instance = newInstance;
  }

  return instance;
}

/**
 * The size a visible pane's terminal fits to, or undefined if it's hidden or
 * hasn't fit yet. New shells start at a size measured from an existing pane,
 * because a shell that starts wider than its pane and then shrinks leaves its
 * first prompt wrapped onto a stray line.
 */
export function getTerminalSize(
  paneId: string,
): { cols: number; rows: number } | undefined {
  const instance = xtermInstancesByPane.get(paneId);
  // Hidden panes skip fitting, so their last size can be stale.
  if (!instance?.ready || !instance.terminal.element?.clientWidth) {
    return undefined;
  }
  const { cols, rows } = instance.terminal;
  return { cols, rows };
}

/** The width of one column in a pane's terminal, in CSS pixels. */
export function getTerminalCellWidth(paneId: string): number | undefined {
  const terminal = xtermInstancesByPane.get(paneId)?.terminal;
  // FitAddon reads the cell size from the same private dimensions.
  const width: number | undefined = (terminal as any)?._core?._renderService
    ?.dimensions?.css?.cell?.width;
  return width || undefined;
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
 * Update terminal theme for all active terminals
 * Called when the app theme changes
 */
export function updateTerminalThemes() {
  const terminalTheme = getTerminalTheme();

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
