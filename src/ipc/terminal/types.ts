import type { CloudTerminalOptions } from "@shared/types";
import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  cwd: string;
  lastProcessName: string;

  isRendererReady: boolean;
  bufferedOutput: string[];

  // VM metadata (only present for remote VM sessions)
  vmId?: string; // Reference to the VM this terminal is connected to

  // Internal state for tracking CWD
  oscBuffer: string;
  cwdPoller?: NodeJS.Timeout;
  isPollingCwd: boolean;
  pendingCwdPoll?: NodeJS.Timeout;
  scheduleCwdPoll?: (delay?: number) => void;
  cwdPollFailures: number; // Consecutive polling failures
  cwdPollBackedOff: boolean; // Whether we've stopped polling due to errors
};

export type CreateTerminalOptions = {
  cwd?: string;
  vmId?: string | "local"; // VM ID to connect to, or "local" for local terminal
  vmIdleTimeout?: number;
} & CloudTerminalOptions;

export type CloudEnvironment = {
  vmId: string;
  vmHost: string;
  sshPort: number;
  imageId: string;
  useSSHKey?: boolean;

  // SSH connection state tracking
  connectionState: "connecting" | "connected" | "disconnected";
  connectionStartTime?: number; // Timestamp when connection started (for timeout detection)

  // VM Agent WebSocket connection
  agentPort?: number; // Forwarded port for vm-agent WebSocket connection

  // Port forwarding state
  detectedPorts: Set<number>;
  forwardedPorts: Map<number, string>; // port -> connection_url

  // Git sync state - applied after repo clone to preserve history
  localRepoCwd?: string; // Local repo path for SSH push
  diffPatches?: {
    staged: Buffer | null;
    unstaged: Buffer | null;
    untracked: Buffer | null;
  }; // Working tree changes preserving staging state
  repoName?: string; // Repository name for determining clone path
  localBranch?: string; // Local branch name (may not exist on remote)
  branchExistsOnRemote?: boolean; // Whether local branch exists on remote

  // Connected terminals/panes
  connectedTerminals: Set<string>; // Terminal IDs connected to this VM
  connectedEditors: Set<string>; // Editor pane IDs connected to this VM
};

export type SendToRendererFn = (channel: string, payload: unknown) => void;
