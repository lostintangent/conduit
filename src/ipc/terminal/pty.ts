import { spawn } from "node-pty";

export const resolveShell = () => {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }

  return process.env.SHELL ?? "bash";
};

export function spawnTerminalProcess(cwd?: string) {
  const shell = resolveShell();
  const homeDirectory = process.env.HOME ?? process.cwd();

  return spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: cwd ?? homeDirectory,
    env: process.env,
  });
}
