import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { CLI_COMMAND_NAME, type CliResponse } from "../../shared/cli";
import { ensureLauncherScripts } from "./launchers";
import {
  createCliServer,
  type CliServer,
  type SendToRendererFn,
} from "./server";

type CliState = {
  binDir: string;
  socketPath: string;
  server: CliServer;
};

let cliState: CliState | null = null;

function resolveSocketPath(baseDir: string) {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${CLI_COMMAND_NAME}-${process.pid}`;
  }

  return path.join(baseDir, "cli.sock");
}

async function removeStaleSocket(socketPath: string) {
  if (process.platform === "win32") return;

  try {
    await fs.unlink(socketPath);
  } catch { }
}

async function prepareCliEnvironment(
  sendToRenderer: SendToRendererFn
): Promise<CliState> {
  const baseDir = path.join(app.getPath("userData"), "cli");
  const binDir = path.join(baseDir, "bin");
  await fs.mkdir(binDir, { recursive: true });

  const electronBinary = process.execPath;
  const bundlePath = path.join(app.getAppPath(), ".vite", "build", "cli.js");

  await ensureLauncherScripts(binDir, electronBinary, bundlePath);

  const socketPath = resolveSocketPath(baseDir);
  await removeStaleSocket(socketPath);

  const server = await createCliServer(socketPath, sendToRenderer);

  return {
    binDir,
    socketPath,
    server,
  };
}

export async function initializeCliHandlers(sendToRenderer: SendToRendererFn) {
  try {
    cliState = await prepareCliEnvironment(sendToRenderer);
  } catch (error) {
    console.warn("Failed to initialize Conduit CLI support.", error);
    return;
  }

  ipcMain.handle("cli:respond", async (_, payload: CliResponse) =>
    cliState.server.respond(payload)
  );
}

export function getCliBinDirectory() {
  return cliState?.binDir ?? null;
}

export function getCliCommand() {
  return CLI_COMMAND_NAME;
}

export function getCliSocketPath() {
  return cliState?.socketPath ?? null;
}

export async function shutdownCliServer() {
  if (!cliState) return;

  await cliState.server.shutdown("Conduit is shutting down.");

  const socketPath = cliState.socketPath;
  if (socketPath && process.platform !== "win32") {
    try {
      await fs.unlink(socketPath);
    } catch { }
  }

  cliState = null;
}
