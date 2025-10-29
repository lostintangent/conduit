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

export type TerminalCreateOptions = {
  cwd?: string;
  // VM-specific options
  isRemoteVM?: boolean;
  vmImageId?: string;
  vmLabels?: string[];
  vmIdleTimeout?: number;
};

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
