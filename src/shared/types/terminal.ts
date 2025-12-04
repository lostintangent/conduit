import type { VMMetadata } from "./vm";

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

export type SSHConnectionState = "connecting" | "connected" | "disconnected";

export type TerminalSSHStatePayload = TerminalPayload & {
  state: SSHConnectionState;
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

export type TerminalPromptStreamChunk = {
  type: "data" | "error" | "end";
  data?: string;
  error?: string;
};

export type BackgroundCommandRequest = {
  command: string;
  args?: string[];
  cwd?: string | null;
};
