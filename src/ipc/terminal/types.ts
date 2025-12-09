import type { CloudTerminalOptions, SSHConnectionState } from "@shared/types";
import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  lastProcessName: string;

  isRendererReady: boolean;
  bufferedOutput: string[];

  // Event listener cleanup functions
  cleanupListeners?: () => void;

  // VM metadata (only present for remote VM sessions)
  cloudEnvironment?: CloudEnvironment;
};

export type CreateTerminalOptions = {
  cwd?: string;
  existingVMId?: string; // Connect to an existing VM instead of creating one
  vmIdleTimeout?: number;
} & CloudTerminalOptions;

export type CloudEnvironment = {
  vmId: string;
  vmHost: string;
  sshPort: number;
  imageId: string;
  useSSHKey?: boolean;

  // SSH connection state tracking
  connectionState: SSHConnectionState;
  connectionStartTime?: number; // Timestamp when connection started (for timeout detection)

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
};

export type SendToRendererFn = (channel: string, payload: unknown) => void;
