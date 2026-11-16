export type TerminalCreateOptions = {
  cwd?: string;
  command?: string; // Command to execute when the terminal is ready
  cols?: number;
  rows?: number;
  /**
   * With no size, start the shell at the first resize instead of at 80x24, so
   * a visible pane's first prompt draws at the width the pane fits to. Input
   * sent before then is written once the shell starts.
   */
  waitForSize?: boolean;
};

const SHELL_NAMES = new Set([
  "bash",
  "zsh",
  "fish",
  "sh",
  "ksh",
  "tcsh",
  "csh",
]);

/**
 * Whether a name, or a path to it, is a shell's own, like `zsh` or `/bin/zsh`,
 * rather than a command it runs. Conduit's shells title their terminal with
 * this name at the prompt, and a terminal is titled with its shell's path
 * until then.
 */
export const isShellName = (name: string): boolean =>
  SHELL_NAMES.has(name.replace(/^\S*\//, ""));

export type BackgroundCommandRequest = {
  command: string;
  args?: string[];
  cwd?: string;
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

type TerminalPromptStreamChunk = {
  type: "data" | "error" | "end";
  data?: string;
  error?: string;
};

/** Every event is broadcast, so each carries the session it belongs to. */
type TerminalEvents = {
  data: { sessionId: string; data: string };
  /** The shell printed, but its output waits in main until a pane shows it. */
  activity: { sessionId: string };
  /** The shell retitled its terminal while its output waits in main. */
  title: { sessionId: string; title: string };
  exit: { sessionId: string; exitCode: number | null; signal: number | null };
  promptStream: { sessionId: string; chunk: TerminalPromptStreamChunk };
};

declare module "@shared/rpc" {
  interface Events {
    terminal: TerminalEvents;
  }
}
