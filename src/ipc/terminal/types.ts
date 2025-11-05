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
  existingVMId?: string; // Connect to an existing VM instead of creating one
  vmIdleTimeout?: number;
} & CloudTerminalOptions;

export type CloudEnvironment = {
  vmId: string;
  vmHost: string;
  sshPort: number;
  imageId: string;
  useSSHKey?: boolean;

  // Port forwarding state
  detectedPorts: Set<number>;
  forwardedPorts: Map<number, string>; // port -> connection_url
};

export type SendToRendererFn = (channel: string, payload: unknown) => void;
