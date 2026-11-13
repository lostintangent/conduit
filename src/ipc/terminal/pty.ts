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
  } else if (shellName === "pwsh" || shellName === "powershell") {
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

export function resolveShell() {
  const { terminalShell } = getCurrentUserSettings();
  if (terminalShell) {
    return terminalShell;
  }

  return process.env.SHELL ?? "bash";
}

function buildTerminalEnv(sessionId: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  const { commandName, cliDirectory, socketPath } = getCliState();

  // Add the Conduit CLI's directory to the $PATH so that commands
  // like `conduit editor-open` can be run from the terminal.
  const pathSegments = (env.PATH ?? "")
    .split(path.delimiter)
    .filter((segment) => segment.length > 0 && segment !== cliDirectory);

  env.PATH = [cliDirectory, ...pathSegments].join(path.delimiter);

  // Set Conduit as the default editor (if the user hasn't disabled this behavior)
  const { useConduitAsEditor } = getCurrentUserSettings();
  if (useConduitAsEditor) {
    // Use --quick flag so $EDITOR invocations open in the quick pane (modal dialog)
    // Direct CLI usage (without --quick) will open in the sidebar editor
    const editor = `${commandName} --quick`;

    // EDITOR/VISUAL are set directly for shells without integration scripts.
    env.EDITOR = editor;
    env.VISUAL = editor;

    // CONDUIT_EDITOR is used by shell integration scripts to re-set EDITOR/VISUAL
    // after user rc files run, ensuring Conduit overrides .zshrc/.bashrc settings.
    env.CONDUIT_EDITOR = editor;
  }

  // Expose the IPC socket path and session ID to the terminal
  // so that CLI commands can communicate with the main process.
  env.CONDUIT_SOCKET_PATH = socketPath;
  env.CONDUIT_SESSION_ID = sessionId;

  return env;
}
