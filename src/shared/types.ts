import { Tab } from "@/types";

export type UserSettings = {
  tabPosition: "top" | "bottom";
  alwaysShowTabs: boolean;
  showTerminalRuler: boolean;
  autoSaveWorkspaces: boolean;
  commandHistory: string[];
  homeDirectory: string | null;
};

export type Workspace = {
  name: string;
  timestamp: number;
  tabs: (Omit<Tab, "panes"> & {
    panes: {
      id: string;
      type: "terminal" | "webview";
      cwd?: string | null;
      url?: string;
      webTitle?: string;
      // For terminal panes - the command that was running
      command?: string | null;
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
};

export type TerminalCreateOptions = {
  cwd?: string;
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
