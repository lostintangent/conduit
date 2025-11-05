import { Tab } from "@/types";

export type UserSettings = {
  tabPosition: "top" | "bottom";
  alwaysShowTabs: boolean;
  showTerminalRuler: boolean;
  autoSaveWorkspaces: boolean;
  commandHistory: string[];
  urlHistory: string[];
  homeDirectory: string | null;
};

export type Workspace = {
  name: string;
  timestamp: number;
  tabs: (Omit<Tab, "panes"> & {
    panes: {
      id: string;
      type: "terminal" | "webview" | "editor";
      cwd?: string | null;
      url?: string;
      webTitle?: string;
      // For terminal panes - the command that was running
      command?: string | null;
      // For editor panes
      filePath?: string;
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
