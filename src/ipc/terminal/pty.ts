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
  return path.join(__dirname, "../../src/ipc/terminal/shell");
}

export function spawnTerminalProcess(sessionId: string, cwd?: string) {
  const shell = resolveShell();
  const env = buildTerminalEnv(sessionId);

  // Default to the user's home directory if no CWD is provided
  if (!cwd) {
    cwd = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
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
    // Set ZDOTDIR to our shell integration directory so zsh loads our .zshenv
    // which restores the original ZDOTDIR and installs the OSC 7 hook
    env.ZDOTDIR = shellIntegrationDir;
  } else if (shellName === "bash") {
    // Force bash to load our integration script via --rcfile
    const scriptPath = path.join(shellIntegrationDir, "conduit.bash");
    args = ["--rcfile", scriptPath];
  } else if (shellName === "fish") {
    // Use fish's --init-command to source our integration script
    const scriptPath = path.join(shellIntegrationDir, "conduit.fish");
    args = ["--init-command", `source "${scriptPath}"`];
  } else if (
    shellName === "pwsh" ||
    shellName === "pwsh.exe" ||
    shellName === "powershell" ||
    shellName === "powershell.exe"
  ) {
    // Note: Test if this actually works
    const scriptPath = path.join(shellIntegrationDir, "conduit.ps1");
    args = ["-NoExit", "-Command", `. "${scriptPath}"`];
  }

  return spawn(shell, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env,
  });
}

// Cache the resolved shell to avoid repeatedly checking which PowerShell is available
let cachedWindowsShell: string | null = null;

export function resolveShell() {
  const { terminalShell } = getCurrentUserSettings();
  if (terminalShell) {
    return terminalShell;
  }

  if (process.platform === "win32") {
    // Return cached result if we've already detected the shell
    if (cachedWindowsShell) {
      return cachedWindowsShell;
    }

    // Try to find an available PowerShell (pwsh.exe or powershell.exe)
    const { execFileSync } = require("node:child_process");

    // Try PowerShell Core first
    try {
      execFileSync("pwsh.exe", ["-Command", "exit"], { stdio: "ignore" });
      cachedWindowsShell = "pwsh.exe";
    } catch {
      // PowerShell Core not found, use Windows PowerShell (always available on Windows)
      cachedWindowsShell = "powershell.exe";
    }
    return cachedWindowsShell;
  }

  return process.env.SHELL ?? "bash";
}

function buildTerminalEnv(sessionId: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  const { commandName, cliDirectory, socketPath } = getCliState();

  // Add the Conduit CLI's directory to the $PATH so that commands
  // like `conduit editor-open` can be run from the terminal.
  // On Windows, PATH can be stored as "Path" or "PATH", so normalize it
  const currentPath = env.PATH || env.Path || "";
  const pathSegments = currentPath
    .split(path.delimiter)
    .filter((segment) => segment.length > 0 && segment !== cliDirectory);

  env.PATH = [cliDirectory, ...pathSegments].join(path.delimiter);

  // On Windows, also set Path to ensure compatibility
  if (process.platform === "win32") {
    delete env.Path;
  }

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
