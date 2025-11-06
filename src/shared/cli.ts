export const CLI_COMMAND_NAME = "conduit";

/* CLI -> IPC -> Renderer */

export type CliRequest = {
  sessionId: string;
  requestId: string;
  command: CliCommand;
};

export type CliCommand =
  | CliOpenFileCommand
  | CliGetPanesCommand
  | CliReadTerminalCommand;

export type CliOpenFileCommand = {
  type: "open-file";
  filePath: string | null;
  cwd: string;
};

export type CliGetPanesCommand = {
  type: "get-panes";
};

export type CliReadTerminalCommand = {
  type: "read-terminal";
  sessionId: string;
};

/* Renderer -> IPC -> CLI */

export type CliResponse = {
  requestId: string;
  status: "ok" | "error";
  message?: string;
  data?: any;
};
