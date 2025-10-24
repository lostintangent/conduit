import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentSessionCleanupRequest,
  AgentSessionCleanupResult,
  AgentSessionFinalizeRequest,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
  AgentSessionSpawnRequest,
  AppPreferences,
  BackgroundCommandRequest,
  TerminalCreateOptions,
  TerminalCreateResponse,
  TerminalCwdPayload,
  TerminalDataPayload,
  TerminalExitPayload,
  TerminalTitlePayload,
} from "./shared/types";

// Note: This file should never include any actual logic. It should simply be a
// connection pass through to an IPC handler in the main process.

function createEventListener<T>(
  channel: string,
  listener: (payload: T) => void
) {
  const handler = (_: Electron.IpcRendererEvent, payload: T) =>
    listener(payload);

  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const conduitAPI = {
  platform: process.platform,

  /* Terminal methods (UI->main) */

  createTerminal: (options?: TerminalCreateOptions) =>
    ipcRenderer.invoke(
      "terminal:create",
      options
    ) as Promise<TerminalCreateResponse | null>,

  closeTerminal: (sessionId: string) =>
    ipcRenderer.send("terminal:close", { sessionId }),

  sendKeypress: (sessionId: string, input: string) =>
    ipcRenderer.send("terminal:input", { sessionId, input }),

  resize(sessionId: string, cols: number, rows: number) {
    ipcRenderer.send("terminal:resize", { sessionId, cols, rows });
  },

  markTerminalReady: (sessionId: string) =>
    ipcRenderer.send("terminal:ready", { sessionId }),

  /* UI event listeners (main->UI) */

  // Notify when terminal process has new data to display
  onData: (sessionId: string, listener: (data: string) => void) =>
    createEventListener<TerminalDataPayload>("terminal:data", (payload) => {
      if (payload.sessionId === sessionId) {
        listener(payload.data);
      }
    }),

  // Notify when terminal title has changed
  onTitle: (listener: (payload: TerminalTitlePayload) => void) =>
    createEventListener("terminal:title", listener),

  // Notify when terminal's current working directory has changed
  onCwd: (listener: (payload: TerminalCwdPayload) => void) =>
    createEventListener("terminal:cwd", listener),

  // Notify when terminal has exited (e.g. user ran `exit` command or closed shell)
  onExit: (listener: (payload: TerminalExitPayload) => void) =>
    createEventListener("terminal:exit", listener),

  // Notify when user requests a new tab (e.g. via menu or keyboard shortcut)
  onNewTabRequest: (listener: () => void) =>
    createEventListener("ui:new-tab-request", listener),

  // Notify when the user clicks a context menu action
  onContextMenuAction: (
    listener: (payload: {
      action: string;
      tabId: string;
      paneId?: string;
    }) => void
  ) => createEventListener("ui:context-menu-action", listener),

  // Notify when the user changes the tab position setting
  onTabPositionChange: (listener: (position: "top" | "bottom") => void) =>
    createEventListener("ui:set-tab-position", listener),

  onAlwaysShowTabStripChange: (listener: (value: boolean) => void) =>
    createEventListener<boolean>("ui:set-always-show-tab-strip", listener),

  onShowOverviewRulerChange: (listener: (value: boolean) => void) =>
    createEventListener<boolean>("ui:set-show-overview-ruler", listener),

  /* UI-related methods (UI->main) */

  getPreferences: () =>
    ipcRenderer.invoke("ui:get-preferences") as Promise<AppPreferences>,

  showContextMenu: (options: {
    tabId: string;
    paneId?: string;
    canChangeTitle: boolean;
    hasGitRepo?: boolean;
  }) => ipcRenderer.send("ui:show-context-menu", options),

  addCommandHistoryEntry: (command: string) =>
    ipcRenderer.invoke("ui:add-command-history-entry", command) as Promise<
      string[]
    >,

  removeCommandHistoryEntry: (command: string) =>
    ipcRenderer.invoke("ui:remove-command-history-entry", command) as Promise<
      string[]
    >,

  runBackgroundCommand: (options: BackgroundCommandRequest) =>
    ipcRenderer.invoke("ui:run-background-command", options) as Promise<void>,

  openExternal: (url: string) =>
    ipcRenderer.invoke("ui:open-url", url) as Promise<void>,

  /* Session management methods */

  hasSessions: () =>
    ipcRenderer.invoke("session:has-sessions") as Promise<boolean>,

  loadSessions: () =>
    ipcRenderer.invoke("session:load-sessions") as Promise<unknown[]>,

  saveSession: (name: string, tabs: unknown) =>
    ipcRenderer.invoke("session:save-session", name, tabs) as Promise<
      unknown[]
    >,

  deleteSession: (timestamp: number) =>
    ipcRenderer.invoke("session:delete-session", timestamp) as Promise<void>,

  /* Agent session management */

  spawnAgentSession: (payload: AgentSessionSpawnRequest) =>
    ipcRenderer.invoke("agent:spawn-session", payload) as Promise<
      AgentSessionInfo
    >,

  listAgentSessions: () =>
    ipcRenderer.invoke("agent:list-sessions") as Promise<AgentSessionInfo[]>,

  hasGitRepository: (cwd: string) =>
    ipcRenderer.invoke("agent:has-git-repo", cwd) as Promise<boolean>,

  finalizeAgentSession: (payload: AgentSessionFinalizeRequest) =>
    ipcRenderer.invoke(
      "agent:finalize-session",
      payload
    ) as Promise<AgentSessionFinalizeResult>,

  cleanupAgentSession: (payload: AgentSessionCleanupRequest) =>
    ipcRenderer.invoke(
      "agent:cleanup-session",
      payload
    ) as Promise<AgentSessionCleanupResult>,
};

export type ConduitAPI = typeof conduitAPI;

contextBridge.exposeInMainWorld("conduit", conduitAPI);
