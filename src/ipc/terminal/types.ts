import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  lastProcessName: string;

  isRendererReady: boolean;
  bufferedOutput: string[];
  cwd: string;

  // Command to execute when the terminal becomes ready (for workspace restore)
  pendingCommand?: string;
};

export type SendToRendererFn = (channel: string, payload: unknown) => void;
