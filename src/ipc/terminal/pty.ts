import { spawn } from "node-pty";

export const resolveShell = () => {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }

  return process.env.SHELL ?? "bash";
};

export const spawnTerminalProcess = (startingDirectory?: string) => {
  const shell = resolveShell();
  const homeDirectory = process.env.HOME ?? process.cwd();
  const desiredDirectory = startingDirectory ?? homeDirectory;

  try {
    return spawn(shell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: desiredDirectory,
      env: process.env,
    });
  } catch (error) {
    console.warn(
      "Failed to spawn PTY with custom cwd, falling back to home directory.",
      error
    );
    return spawn(shell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: homeDirectory,
      env: process.env,
    });
  }
};
