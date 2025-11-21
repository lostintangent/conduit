import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentSessionCleanupRequest,
  AgentSessionCleanupResult,
  AgentSessionFinalizeRequest,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
  AgentSessionSpawnRequest,
  BackgroundCommandRequest,
  Branch,
  BrowserPage,
  CreateVMPayload,
  DeleteVMPayload,
  FileChangedEvent,
  FileDiffResult,
  FileRenamedEvent,
  FileStats,
  FileTreeNode,
  ForkVMPayload,
  ForwardPortResponse,
  GitFileStatus,
  ListVMsPayload,
  TerminalCaptureCommandResponse,
  TerminalCreateOptions,
  TerminalCreateResponse,
  TerminalCwdPayload,
  TerminalDataPayload,
  TerminalExitPayload,
  TerminalPromptRequest,
  TerminalPromptResponse,
  TerminalPromptStreamChunk,
  TerminalSSHStatePayload,
  TerminalTitlePayload,
  TreeChangedEvent,
  UserSettings,
  VMInfo,
} from "../shared/types";
import configureBrowserModule from "./modules/browser";
import configureCliModule from "./modules/cli";
import configureUpdatesModule from "./modules/updates";
import configureWorkspaceModule from "./modules/workspace";
import { createEventListener } from "./utils";

const conduitAPI = {
  platform: process.platform,

  /* Terminal methods (UI->main) */

  createTerminal: (options?: TerminalCreateOptions) =>
    ipcRenderer.invoke(
      "terminal:create",
      options,
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

  captureTerminalCommand: (sessionId: string) =>
    ipcRenderer.invoke("terminal:capture-command", {
      sessionId,
    }) as Promise<TerminalCaptureCommandResponse>,

  promptTerminal: (request: TerminalPromptRequest) =>
    ipcRenderer.invoke(
      "terminal:prompt",
      request,
    ) as Promise<TerminalPromptResponse>,

  onPromptStream: (
    sessionId: string,
    listener: (chunk: TerminalPromptStreamChunk) => void,
  ) =>
    createEventListener<TerminalPromptStreamChunk>(
      `terminal:prompt:stream:${sessionId}`,
      listener,
    ),

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

  // Notify when SSH connection state changes for cloud terminals
  onSSHStateChange: (listener: (payload: TerminalSSHStatePayload) => void) =>
    createEventListener("terminal:ssh-state", listener),

  // Notify when user requests a new tab (e.g. via menu or keyboard shortcut)
  onNewTabRequest: (listener: () => void) =>
    createEventListener("ui:new-tab-request", listener),

  // Notify when user requests to open a workspace (e.g. via menu)
  onOpenWorkspaceRequest: (listener: (workspace: unknown) => void) =>
    createEventListener("ui:open-workspace-request", listener),

  // Notify when the user clicks a context menu command
  onContextMenuCommand: (
    listener: (payload: {
      commandId: string;
      tabId: string;
      paneId?: string;
    }) => void,
  ) => createEventListener("ui:context-menu-command", listener),

  // Notify when the app is about to close
  onBeforeClose: (listener: () => void) =>
    createEventListener("app:before-close", listener),

  // Notify when the user changes the tab position setting
  onTabPositionChange: (listener: (position: "top" | "bottom") => void) =>
    createEventListener("ui:set-tab-position", listener),

  onAlwaysShowTabsChange: (listener: (value: boolean) => void) =>
    createEventListener<boolean>("ui:set-always-show-tabs", listener),

  // Notify when showing a notification/toast message
  onShowNotification: (
    listener: (payload: {
      type: "success" | "error" | "info";
      message: string;
      timeout?: number;
    }) => void,
  ) => createEventListener("notification:show", listener),

  onShowTerminalRulerChange: (listener: (value: boolean) => void) =>
    createEventListener<boolean>("ui:set-show-terminal-ruler", listener),

  onUseConduitAsEditorChange: (listener: (value: boolean) => void) =>
    createEventListener<boolean>("ui:set-use-conduit-editor", listener),

  onOpenTerminalFontSettings: (listener: () => void) =>
    createEventListener("ui:open-terminal-font-settings", listener),

  /* UI-related methods (UI->main) */

  getSettings: () =>
    ipcRenderer.invoke("ui:get-settings") as Promise<UserSettings>,

  updateSettings: (updates: Partial<UserSettings>) =>
    ipcRenderer.invoke("ui:update-settings", updates) as Promise<UserSettings>,

  showContextMenu: (options: {
    tabId: string;
    paneId?: string;
    menuItems: Array<{
      commandId: string;
      title: string;
      group: string;
      enabled: boolean;
      keybinding?: string;
    }>;
  }) => ipcRenderer.send("ui:show-context-menu", options),

  addCommandHistoryEntry: (command: string) =>
    ipcRenderer.invoke("ui:add-command-history-entry", command) as Promise<
      string[]
    >,

  removeCommandHistoryEntry: (command: string) =>
    ipcRenderer.invoke("ui:remove-command-history-entry", command) as Promise<
      string[]
    >,

  addUrlToHistory: (url: string) =>
    ipcRenderer.invoke("ui:add-url-to-history", url) as Promise<string[]>,

  removeUrlFromHistory: (url: string) =>
    ipcRenderer.invoke("ui:remove-url-from-history", url) as Promise<string[]>,

  addStarredPage: (page: BrowserPage) =>
    ipcRenderer.invoke("ui:add-starred-page", page) as Promise<BrowserPage[]>,

  removeStarredPage: (url: string) =>
    ipcRenderer.invoke("ui:remove-starred-page", url) as Promise<BrowserPage[]>,

  runBackgroundCommand: (options: BackgroundCommandRequest) =>
    ipcRenderer.invoke("ui:run-background-command", options) as Promise<void>,

  openExternal: (url: string) =>
    ipcRenderer.invoke("ui:open-url", url) as Promise<void>,

  showFolderPicker: (defaultPath?: string) =>
    ipcRenderer.invoke("ui:show-folder-picker", defaultPath) as Promise<
      string | null
    >,

  /* Window control methods */

  minimizeWindow: () => ipcRenderer.send("ui:window-minimize"),

  maximizeWindow: () => ipcRenderer.send("ui:window-maximize"),

  closeWindow: () => ipcRenderer.send("ui:window-close"),

  isWindowMaximized: () =>
    ipcRenderer.invoke("ui:window-is-maximized") as Promise<boolean>,

  /* Agent session management */

  spawnAgentSession: (payload: AgentSessionSpawnRequest) =>
    ipcRenderer.invoke(
      "agent:spawn-session",
      payload,
    ) as Promise<AgentSessionInfo>,

  listAgentSessions: () =>
    ipcRenderer.invoke("agent:list-sessions") as Promise<AgentSessionInfo[]>,

  hasGitRepository: (cwd: string) =>
    ipcRenderer.invoke("agent:has-git-repo", cwd) as Promise<boolean>,

  getCurrentBranch: (cwd: string) =>
    ipcRenderer.invoke("agent:get-current-branch", cwd) as Promise<
      string | null
    >,

  getRemoteOriginUrl: (cwd: string) =>
    ipcRenderer.invoke("agent:get-remote-origin-url", cwd) as Promise<
      string | null
    >,

  getGitHubRepoInfo: (cwd: string) =>
    ipcRenderer.invoke("agent:get-github-repo-info", cwd) as Promise<{
      owner: string;
      name: string;
      branch: string;
      branchExistsOnRemote: boolean;
      defaultBranch: string;
    } | null>,

  hasUncommittedChanges: (cwd: string) =>
    ipcRenderer.invoke(
      "agent:has-uncommitted-changes",
      cwd,
    ) as Promise<boolean>,

  hasUnpushedCommits: (cwd: string) =>
    ipcRenderer.invoke("agent:has-unpushed-commits", cwd) as Promise<boolean>,

  pushCommitsViaSSH: (
    cwd: string,
    sshHost: string,
    sshPort: number,
    sshKeyPath: string,
    remotePath?: string,
  ) =>
    ipcRenderer.invoke(
      "agent:push-commits-via-ssh",
      cwd,
      sshHost,
      sshPort,
      sshKeyPath,
      remotePath,
    ) as Promise<boolean>,

  createDiffPatch: (cwd: string) =>
    ipcRenderer.invoke("agent:create-diff-patch", cwd) as Promise<{
      stagedPatch: Buffer | null;
      unstagedPatch: Buffer | null;
      untrackedPatch: Buffer | null;
    } | null>,

  applyDiffPatch: (cwd: string, patchData: Buffer) =>
    ipcRenderer.invoke(
      "agent:apply-diff-patch",
      cwd,
      patchData,
    ) as Promise<boolean>,

  gitPull: (cwd: string, rebase = false) =>
    ipcRenderer.invoke("agent:git-pull", cwd, rebase) as Promise<{
      stdout: string;
      stderr: string;
    }>,

  gitPush: (cwd: string, force = false, setUpstream = false) =>
    ipcRenderer.invoke("agent:git-push", cwd, force, setUpstream) as Promise<{
      stdout: string;
      stderr: string;
    }>,

  hasUpstreamBranch: (cwd: string) =>
    ipcRenderer.invoke("agent:has-upstream-branch", cwd) as Promise<boolean>,

  gitCommit: (cwd: string, message: string) =>
    ipcRenderer.invoke("agent:git-commit", cwd, message) as Promise<{
      stdout: string;
      stderr: string;
    }>,

  gitStage: (cwd: string, files: string[]) =>
    ipcRenderer.invoke("agent:git-stage", cwd, files) as Promise<{
      stdout: string;
      stderr: string;
    }>,

  gitUnstage: (cwd: string, files: string[]) =>
    ipcRenderer.invoke("agent:git-unstage", cwd, files) as Promise<{
      stdout: string;
      stderr: string;
    }>,

  gitRevert: (cwd: string, files: string[]) =>
    ipcRenderer.invoke("agent:git-revert", cwd, files) as Promise<{
      stdout: string;
      stderr: string;
    }>,

  finalizeAgentSession: (payload: AgentSessionFinalizeRequest) =>
    ipcRenderer.invoke(
      "agent:finalize-session",
      payload,
    ) as Promise<AgentSessionFinalizeResult>,

  cleanupAgentSession: (payload: AgentSessionCleanupRequest) =>
    ipcRenderer.invoke(
      "agent:cleanup-session",
      payload,
    ) as Promise<AgentSessionCleanupResult>,

  /* File system methods (UI->main) */

  /**
   * Lists the contents of a directory.
   *
   * @param directoryPath - The directory to list
   * @param rootPath - Optional root path for computing relative paths (used for git status matching)
   */
  listDirectory: (directoryPath: string, rootPath?: string) =>
    ipcRenderer.invoke("fs:list-directory", directoryPath, rootPath) as Promise<
      FileTreeNode[]
    >,

  readFile: (filePath: string) =>
    ipcRenderer.invoke("fs:read-file", filePath) as Promise<string>,

  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("fs:write-file", filePath, content) as Promise<void>,

  deleteFile: (filePath: string) =>
    ipcRenderer.invoke("fs:delete-file", filePath) as Promise<void>,

  fileExists: (filePath: string) =>
    ipcRenderer.invoke("fs:file-exists", filePath) as Promise<boolean>,

  getFileStats: (filePath: string) =>
    ipcRenderer.invoke("fs:get-stats", filePath) as Promise<FileStats>,

  /* File watcher methods (UI->main) */

  subscribeFileWatcher: (cwd: string, paneId: string) =>
    ipcRenderer.invoke("file-watcher:subscribe", cwd, paneId) as Promise<{
      success: boolean;
      error?: string;
    }>,

  unsubscribeFileWatcher: (cwd: string, paneId: string) =>
    ipcRenderer.invoke("file-watcher:unsubscribe", cwd, paneId) as Promise<{
      success: boolean;
      error?: string;
    }>,

  onFileChanged: (listener: (payload: FileChangedEvent) => void) =>
    createEventListener<FileChangedEvent>(
      "file-watcher:file-changed",
      listener,
    ),

  onFileRenamed: (listener: (payload: FileRenamedEvent) => void) =>
    createEventListener<FileRenamedEvent>(
      "file-watcher:file-renamed",
      listener,
    ),

  onTreeChanged: (listener: (payload: TreeChangedEvent) => void) =>
    createEventListener<TreeChangedEvent>(
      "file-watcher:tree-changed",
      listener,
    ),

  /* Git status methods (UI->main) */

  getGitStatus: (cwd: string) =>
    ipcRenderer.invoke("git:get-status", cwd) as Promise<{
      success: boolean;
      gitStatus: Record<string, GitFileStatus> | null;
      error?: string;
    }>,

  setBaseBranch: (cwd: string, baseBranch: string | null) =>
    ipcRenderer.invoke("git:set-base-branch", cwd, baseBranch) as Promise<{
      success: boolean;
      error?: string;
    }>,

  getBranches: (cwd: string) =>
    ipcRenderer.invoke("git:get-branches", cwd) as Promise<{
      success: boolean;
      branches: Branch[];
      error?: string;
    }>,

  getMostRecentFile: (cwd: string) =>
    ipcRenderer.invoke("git:get-most-recent-file", cwd) as Promise<{
      success: boolean;
      file: string | null;
      error?: string;
    }>,

  refreshGitStatus: (cwd: string) =>
    ipcRenderer.invoke("git:refresh-status", cwd) as Promise<{
      success: boolean;
      error?: string;
    }>,

  getFileDiff: (filePath: string, cwd: string, baseBranch?: string | null) =>
    ipcRenderer.invoke(
      "git:get-file-diff",
      filePath,
      cwd,
      baseBranch,
    ) as Promise<{
      success: boolean;
      diff: FileDiffResult | null;
      error?: string;
    }>,

  getDiffStats: (cwd: string) =>
    ipcRenderer.invoke("git:get-diff-stats", cwd) as Promise<{
      success: boolean;
      stats?: { added: number; removed: number; files: number };
      error?: string;
    }>,

  onGitStatusChanged: (
    listener: (payload: {
      cwd: string;
      gitStatus: Record<string, GitFileStatus> | null;
      baseBranch: string | null;
      currentBranch: string | null;
    }) => void,
  ) => createEventListener("git:status-changed", listener),

  /* Legacy file watcher (deprecated - use file watcher methods above) */

  watchFile: (filePath: string, onChange: () => void) => {
    const watcherId = `file-watcher-${Math.random().toString(36).substring(7)}`;

    // Set up listener for file changes
    const removeListener = createEventListener<{
      watcherId: string;
      filePath: string;
    }>("fs:file-changed", (payload) => {
      if (payload.watcherId === watcherId && payload.filePath === filePath) {
        onChange();
      }
    });

    // Register the watcher in main process
    ipcRenderer.invoke("fs:watch-file", filePath, watcherId);

    return {
      dispose: () => {
        ipcRenderer.invoke("fs:unwatch-file", watcherId);
        removeListener();
      },
    };
  },

  /* VM methods (UI->main) */

  createVM: (payload?: CreateVMPayload) =>
    ipcRenderer.invoke("vm:create", payload) as Promise<VMInfo>,

  listVMs: (payload?: ListVMsPayload) =>
    ipcRenderer.invoke("vm:list", payload) as Promise<VMInfo[]>,

  getVM: (vmId: string) =>
    ipcRenderer.invoke("vm:get", vmId) as Promise<VMInfo>,

  deleteVM: (payload: DeleteVMPayload) =>
    ipcRenderer.invoke("vm:delete", payload) as Promise<void>,

  forkVM: (vmId: string, payload?: Omit<ForkVMPayload, "vmId">) =>
    ipcRenderer.invoke("vm:fork", { vmId, ...payload }) as Promise<VMInfo>,

  executeInVM: (
    vmId: string,
    command: string,
    args?: string[],
    timeoutSeconds?: number,
  ) =>
    ipcRenderer.invoke("vm:execute", {
      vmId,
      command,
      args,
      timeoutSeconds,
    }) as Promise<{
      exit_code: number;
      stdout: string;
      stderr: string;
      error?: string;
    }>,

  configureVMForGitPush: (vmId: string, repoPath: string) =>
    ipcRenderer.invoke("vm:configure-git-push", {
      vmId,
      repoPath,
    }) as Promise<{ success: boolean; error?: string }>,

  applyDiffToVM: (vmId: string, diffPatch: Buffer, repoPath: string) =>
    ipcRenderer.invoke("vm:apply-diff", {
      vmId,
      diffPatch,
      repoPath,
    }) as Promise<{ success: boolean; error?: string }>,

  forwardPort: (vmId: string, port: number, description?: string) =>
    ipcRenderer.invoke("vm:forward-port", {
      vmId,
      port,
      description,
    }) as Promise<ForwardPortResponse>,

  reloadVMConfig: () =>
    ipcRenderer.invoke("vm:reload-config") as Promise<{ success: boolean }>,

  browser: configureBrowserModule,
  cli: configureCliModule,
  updates: configureUpdatesModule,
  workspace: configureWorkspaceModule,
};

export type ConduitAPI = typeof conduitAPI;

contextBridge.exposeInMainWorld("conduit", conduitAPI);
