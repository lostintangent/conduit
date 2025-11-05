export const CLI_DIRECTORY_NAME = "cli";
export const CLI_BUNDLE_FILENAME = "conduit.js";
export const CLI_COMMAND_NAME = "conduit";

type Request = {
  requestId: string;
};

/* CLI -> IPC */

export type CliRequest = {
  command: CliCommand;
} & Request;

export type CliCommand = CliOpenFileCommand;

export type CliOpenFileCommand = {
  type: "open-file";
  filePath: string | null;
  cwd: string;
};

/* IPC -> Renderer */

export type CliOpenFileRequestPayload = {
  filePath: string | null;
  cwd: string;
} & Request;

/* Renderer -> IPC -> CLI */

export type CliResponse = {
  status: "ok" | "error";
  message?: string;
} & Request;
