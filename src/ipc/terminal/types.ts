import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  cwd: string;
  lastProcessName: string;

  isRendererReady: boolean;
  bufferedOutput: string[];

  // VM metadata (only present for remote VM sessions)
  cloudEnvironment?: CloudEnvironment;

  // Internal state for tracking CWD
  oscBuffer: string;
  cwdPoller?: NodeJS.Timeout;
  isPollingCwd: boolean;
  pendingCwdPoll?: NodeJS.Timeout;
  scheduleCwdPoll?: (delay?: number) => void;
};

export type CreateTerminalOptions = {
  cwd?: string;

  // VM-specific options
  isRemoteVM?: boolean;
  existingVMId?: string; // Connect to an existing VM instead of creating one
  vmImageId?: string;
  vmLabels?: string[];
  vmIdleTimeout?: number;
  githubRepo?: {
    owner: string;
    name: string;
    branch?: string;
  };
};

export type CloudEnvironment = {
  vmId: string;
  vmHost: string;
  sshPort: number;
  imageId: string;
  useSSHKey?: boolean;
};

export type SendToRendererFn = (channel: string, payload: unknown) => void;
