import type { IPty } from "node-pty";

export type CreateSessionOptions = {
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
};

export type SendToRendererFn = (channel: string, payload: unknown) => void;

export type TerminalSession = {
  id: string;
  pty: IPty;
  lastProcessName: string;
  cwd: string;
  oscBuffer: string;
  cwdPoller?: NodeJS.Timeout;
  isPollingCwd: boolean;
  pendingCwdPoll?: NodeJS.Timeout;
  scheduleCwdPoll?: (delay?: number) => void;
  isRendererReady: boolean;
  pendingOutput: string[];
  readyFallback?: NodeJS.Timeout;
  // VM metadata (only present for remote VM sessions)
  vmMetadata?: VMMetadata;
};
