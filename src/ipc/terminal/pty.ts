import { spawn } from "node-pty";
import path from "node:path";
import { getCliBinDirectory, getCliCommand, getCliSocketPath } from "../cli";
import { getCurrentUserSettings } from "../ui";

export const resolveShell = () => {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }

  return process.env.SHELL ?? "bash";
};

export function spawnTerminalProcess(sessionId: string, cwd?: string) {
  const shell = resolveShell();
  const homeDirectory = process.env.HOME ?? process.cwd();
  const env = buildTerminalEnv(sessionId);

  return spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: cwd ?? homeDirectory,
    env,
  });
}

function buildTerminalEnv(sessionId: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const cliBinDir = getCliBinDirectory();

  if (cliBinDir) {
    const existingPath = env.PATH ?? "";
    const segments = existingPath
      .split(path.delimiter)
      .filter((segment) => segment.length > 0 && segment !== cliBinDir);

    env.PATH = [cliBinDir, ...segments].join(path.delimiter);
  }

  const userSettings = getCurrentUserSettings();
  if (userSettings.useConduitAsEditor !== false) {
    const cliCommand = getCliCommand();
    env.VISUAL = cliCommand;
    env.EDITOR = cliCommand;
  }

  const socketPath = getCliSocketPath();
  if (socketPath) {
    env.CONDUIT_SOCKET_PATH = socketPath;
  }
  env.CONDUIT_SESSION_ID = sessionId;

  return env;
}
