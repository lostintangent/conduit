import type { IPty } from "node-pty";

export type TerminalInstance = {
  id: string;
  pty: IPty;

  isRendererReady: boolean;
  bufferedOutput: string;
  /** Characters sent to the renderer that it hasn't parsed yet. */
  unacknowledged: number;
  /** While the shell is paused, checks whether it has exited. */
  exitCheck?: NodeJS.Timeout;
  /** The shell exited, so the rest of its output is read without pausing. */
  hasExited?: boolean;
  /** No pane shows this shell, so its output waits longer. */
  isHidden?: boolean;
  /** Sends the output that's waiting now. */
  flushOutput?: () => void;
  cwd: string;

  // A restored command, typed at the shell's first prompt
  pendingCommand?: string;
};
