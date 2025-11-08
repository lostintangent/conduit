import { spawn } from "node-pty";
import path from "node:path";
import { getCliState } from "../cli";
import { getCurrentUserSettings } from "../ui";

export function spawnTerminalProcess(sessionId: string, cwd?: string) {
  const shell = resolveShell();
  const env = buildTerminalEnv(sessionId);

  // Default to the user's home directory if no CWD is provided
  if (!cwd) {
    cwd = process.env.HOME ?? process.cwd();
  }

  return spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env,
  });
}

export function resolveShell() {
  if (process.platform === "win32") {
    return "pwsh.exe";
  }

  return process.env.SHELL ?? "bash";
}

function buildTerminalEnv(sessionId: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  const { commandName, cliDirectory, socketPath } = getCliState();

  // Add the Conduit CLI's directory to the $PATH so that commands
  // like `conduit open-file` can be run from the terminal.
  const currentPath = env.PATH ?? "";
  const pathSegments = currentPath
    .split(path.delimiter)
    .filter((segment) => segment.length > 0 && segment !== cliDirectory);
  env.PATH = [cliDirectory, ...pathSegments].join(path.delimiter);

  // Set Conduit as the default editor (if the user hasn't disabled this behavior)
  const { useConduitAsEditor } = getCurrentUserSettings();
  if (useConduitAsEditor) {
    env.VISUAL = commandName;
    env.EDITOR = commandName;
  }

  // Expose the IPC socket path and session ID to the terminal
  // so that CLI commands can communicate with the main process.
  env.CONDUIT_SOCKET_PATH = socketPath;
  env.CONDUIT_SESSION_ID = sessionId;

  return env;
}
