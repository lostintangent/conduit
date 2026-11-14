import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  isRendererReady: boolean;
  bufferedOutput: string;
  /** Characters sent to the renderer that it hasn't parsed yet. */
  unacknowledged: number;
  cwd: string;

  // A restored command, typed at the shell's first prompt
  pendingCommand?: string;
};
