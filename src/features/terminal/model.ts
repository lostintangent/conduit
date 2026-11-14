export type TerminalCreateOptions = {
  cwd?: string;
  command?: string; // Command to execute when the terminal is ready
  cols?: number;
  rows?: number;
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

/** Every event is broadcast, so each carries the session it belongs to. */
export type TerminalEvents = {
  data: { sessionId: string; data: string };
  exit: { sessionId: string; exitCode: number | null; signal: number | null };
  promptStream: { sessionId: string; chunk: TerminalPromptStreamChunk };
};

declare module "@shared/rpc" {
  interface Events {
    terminal: TerminalEvents;
  }
}
