import { spawn } from "node-pty";
import path from "node:path";
import { getCliState } from "../cli";
import { getCurrentUserSettings } from "../ui";

export function resolveShell() {
  if (process.platform === "win32") {
    return "pwsh.exe";
  }

  return process.env.SHELL ?? "bash";
}

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
  const env = { ...process.env };

  const { commandName, cliDirectory, socketPath } = getCliState();

  // Add the Conduit CLI's directory to the $PATH so that commands
  // like `conduit open-file` can be run from the terminal.
  const existingPath = env.PATH ?? "";
  const segments = existingPath
    .split(path.delimiter)
    .filter((segment) => segment.length > 0 && segment !== cliDirectory);
  env.PATH = [cliDirectory, ...segments].join(path.delimiter);

  // Set Conduit as the default editor if the user hasn't disabled this behavior
  const userSettings = getCurrentUserSettings();
  if (userSettings.useConduitAsEditor !== false) {
    env.VISUAL = commandName;
    env.EDITOR = commandName;
  }

  // Expose the IPC socket path and session ID to the terminal
  // so that CLI commands can communicate with the main process.
  env.CONDUIT_SOCKET_PATH = socketPath;
  env.CONDUIT_SESSION_ID = sessionId;

  return env;
}
