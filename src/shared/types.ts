import { Tab } from "@/types";

export type ThemeMode = "light" | "dark" | "system";

export type ThemeOverrides = {
  input?: string;
  border?: string;
  foreground?: string;
  selection?: string;
  accent?: string;
};

export type BrowserPage = {
  url: string;
  title: string;
};

export type UserSettings = {
  tabPosition: "top" | "bottom";
  alwaysShowTabs: boolean;
  showTerminalRuler: boolean;
  autoSaveWorkspaces: boolean;
  useGradientBorders: boolean;
  useConduitAsEditor: boolean;
  theme: ThemeMode;
  themeOverrides?: ThemeOverrides;
  commandHistory: string[];
  urlHistory: string[];
  starredPages: BrowserPage[];
  homeDirectory: string | null;
  terminalPromptAgent?: string;
  terminalPromptBufferLines?: number;
};

export type Workspace = {
  name: string;
  timestamp: number;
  tabs: (Omit<Tab, "panes"> & {
    panes: {
      id: string;
      type: "terminal" | "webview" | "editor";
      cwd?: string | null;

      // For terminal panes - the command that was running
      command?: string | null;

      // For editor panes
      filePath?: string;

      // For webview panes - the pane ID this is showing devtools for
      url?: string;
      webTitle?: string;
      devToolsForPane?: string;
    }[];
  })[];
  activeTabId?: string;
};

/* IPC payloads/responses */

export type TerminalPayload = {
  sessionId: string;
};

export type TerminalCreateResponse = TerminalPayload & {
  title: string;
  cwd: string;
  vmMetadata?: VMMetadata;
};

export type TerminalCaptureCommandResponse = string | null;

/**
 * Cloud/VM terminal configuration options
 * Shared across pane actions, pre-commands, and terminal creation
 */
export interface CloudTerminalOptions {
  /**
   * Whether this should be a remote VM terminal
   */
  isRemoteVM?: boolean;

  /**
   * VM image identifier to use for the cloud terminal
   */
  vmImageId?: string;

  /**
   * Labels to tag the VM with (e.g., for organization/billing)
   */
  vmLabels?: string[];

  /**
   * GitHub repository to clone into the VM
   */
  githubRepo?: {
    owner: string;
    name: string;
    branch?: string;
    branchExistsOnRemote?: boolean; // If false, VM will clone default branch first
    defaultBranch?: string; // Fallback branch if current branch doesn't exist on remote
  };

  /**
   * Local repository working directory path
   * Used to push commits via SSH after VM is created
   */
  localRepoCwd?: string;

  /**
   * Git diff patches for working tree changes
   * Preserves staging state when applied to VM
   */
  diffPatches?: {
    staged: Buffer | null;
    unstaged: Buffer | null;
    untracked: Buffer | null;
  };
}

export type TerminalCreateOptions = {
  cwd?: string;
  existingVMId?: string; // Connect to an existing VM instead of creating one
  vmIdleTimeout?: number;
} & CloudTerminalOptions;

export type VMMetadata = {
  vmId: string;
  vmHost: string;
  sshPort: number;
  imageId: string;
  useSSHKey?: boolean;
};

export type TerminalDataPayload = TerminalPayload & {
  data: string;
};

export type TerminalTitlePayload = TerminalPayload & {
  title: string;
};

export type TerminalExitPayload = TerminalPayload & {
  exitCode: number | null;
  signal: number | null;
};

export type TerminalCwdPayload = TerminalPayload & {
  cwd: string;
};

export type TerminalResizePayload = TerminalPayload & {
  cols: number;
  rows: number;
};

export type TerminalInputPayload = TerminalPayload & {
  input: string;
};

export type TerminalSSHStatePayload = TerminalPayload & {
  state: "connecting" | "connected" | "disconnected";
};

export type BackgroundCommandRequest = {
  command: string;
  args?: string[];
  cwd?: string | null;
};

export type AgentSessionSpawnRequest = {
  cwd: string;
  preferredName?: string;
};

export type AgentSessionInfo = {
  id: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  baseBranch?: string | null;
  createdAt: number;
};

export type AgentSessionFinalizeRequest = {
  sessionId: string;
};

export type AgentSessionFinalizeResult = {
  status: "merged" | "noop" | "conflict";
  message: string;
};

export type AgentSessionCleanupRequest = {
  sessionId: string;
};

export type AgentSessionCleanupResult = {
  status: "removed" | "missing";
  message: string;
};

export type FileTreeNode = {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
};

/**
 * Git file status for a single file
 */
export type GitFileStatus = {
  status:
    | "modified"
    | "added"
    | "deleted"
    | "renamed"
    | "copied"
    | "untracked"
    | "unmodified"
    | "conflict"
    | "type-changed"
    | "ignored";
  staged: boolean;
  relativePath: string;
};

/**
 * Map of relative file paths to their git status
 */
export type GitStatusMap = Map<string, GitFileStatus>;

/**
 * Information about a git branch
 */
export type Branch = {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  lastCommitDate: Date;
  lastCommitHash: string;
  lastCommitMessage: string;
};

/**
 * Result of getting a file diff
 */
export type FileDiffResult = {
  originalContent: string;
  modifiedContent: string;
  status: "modified" | "added" | "deleted" | "binary";
  isBinary: boolean;
};

/* File watcher event payloads */

export type FileChangedEvent = {
  cwd: string;
  filePath: string;
  relativePath: string;
  eventType: "changed" | "deleted";
};

export type TreeChangedEvent = {
  cwd: string;
};

export type FileRenamedEvent = {
  cwd: string;
  oldPath: string;
  newPath: string;
  oldRelativePath: string;
  newRelativePath: string;
};

/* VM IPC payloads */

export type CreateVMPayload = {
  image?: string;
  labels?: string[];
  idle_timeout?: number;
  github_repo?: {
    owner: string;
    name: string;
    branch_or_hash?: string;
    clone_path?: string;
  };
};

export type ListVMsPayload = {
  labels?: string[];
};

export type DeleteVMPayload = {
  vmId: string;
};

export type ForkVMPayload = {
  vmId: string;
  labels?: string[];
  idle_timeout?: number;
};

export type ForwardPortPayload = {
  vmId: string;
  port: number;
  description?: string;
};

export type ForwardPortResponse = {
  message: string;
  external_port: string;
  connection_url: string;
};

export type VMInfo = {
  id: string;
  ip_address: string;
  image_id: string;
  created_at: string;
  state: "Running" | "Paused" | "Stopped";
  forwarded_ports: {
    [port: string]: {
      connection_url: string;
      external_port: string;
      description: string;
    };
  };
};

/* Auto-update types */

export type UpdateStatus =
  | "idle"
  | "checking"
  | "unavailable"
  | "downloading"
  | "downloaded"
  | "installing"
  | "disabled";

export type UpdateState = {
  status: UpdateStatus;
  name?: string;
  notes?: string | null;
};

/* Terminal Prompt Mode types */

export type TerminalPromptRequest = {
  sessionId: string;
  prompt: string;
  agentCommand: string;
};

export type TerminalPromptResponse = {
  success: boolean;
  response?: string;
  error?: string;
};
