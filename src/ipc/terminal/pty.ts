import { app } from "electron";
import { spawn } from "node-pty";
import path from "node:path";
import { getCliState } from "../cli";
import { getCurrentUserSettings } from "../ui";

/**
 * Get the path to the shell integration scripts directory.
 * In development, this is the source directory.
 * In production, this is the extraResources directory.
 */
function getShellIntegrationPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "shell");
  }
  return path.join(__dirname, "shell");
}

export function spawnTerminalProcess(sessionId: string, cwd?: string) {
  const shell = resolveShell();
  const env = buildTerminalEnv(sessionId);

  // Default to the user's home directory if no CWD is provided
  if (!cwd) {
    cwd = process.env.HOME ?? process.cwd();
  }

  // Determine the shell integration script to source
  const shellName = path.basename(shell);
  const shellIntegrationDir = getShellIntegrationPath();
  let args: string[] = [];

  if (shellName === "zsh") {
    // Save user's original ZDOTDIR (if set) so our script can source their config
    if (env.ZDOTDIR) {
      env.CONDUIT_ORIG_ZDOTDIR = env.ZDOTDIR;
    }
    // Set ZDOTDIR to our shell integration directory so zsh loads our .zshrc
    // which sources conduit.zsh (our integration that also sources user's .zshrc)
    env.ZDOTDIR = shellIntegrationDir;
    args = ["-i"];
  } else if (shellName === "bash") {
    const scriptPath = path.join(shellIntegrationDir, "conduit.bash");
    // Set ENV to point at our integration script and use --posix
    // Our script disables POSIX mode and sources user's config files
    env.ENV = scriptPath;
    args = ["--posix", "-i"];
  } else if (
    shellName === "pwsh" ||
    shellName === "pwsh.exe" ||
    shellName === "powershell" ||
    shellName === "powershell.exe"
  ) {
    const scriptPath = path.join(shellIntegrationDir, "conduit.ps1");
    args = ["-NoExit", "-Command", `. "${scriptPath}"`];
  }
  // For other shells, just spawn normally

  return spawn(shell, args, {
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
  // like `conduit editor-open` can be run from the terminal.
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
