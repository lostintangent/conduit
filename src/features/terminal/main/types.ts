import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  lastProcessName: string;

  isRendererReady: boolean;
  bufferedOutput: string;
  cwd: string;

  // A restored command, which runs at the shell's first prompt
  pendingCommand?: string;
};
