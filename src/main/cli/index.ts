import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { CLI_COMMAND_NAME, type CliResponse } from "../../shared/cli/types";
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

function requireCliState() {
  if (!cliState) {
    throw new Error("The Conduit CLI server isn't running.");
  }
  return cliState;
}

function resolveSocketPath(baseDir: string) {
  const envSuffix = app.isPackaged ? "" : "-dev";

  const socketFileName = `cli${envSuffix}.sock`;
  return path.join(baseDir, socketFileName);
}

async function prepareCliEnvironment(
  sendToRenderer: SendToRendererFn,
): Promise<CliState> {
  const baseDir = path.join(app.getPath("userData"), "cli");
  const binDir = path.join(baseDir, "bin");
  await fs.mkdir(binDir, { recursive: true });

  const electronBinary = process.execPath;
  const cliPath = path.join(app.getAppPath(), "dist", "main", "cli.js");

  await ensureLauncherScripts(binDir, electronBinary, cliPath);

  const socketPath = resolveSocketPath(baseDir);
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
    requireCliState().server.respond(payload),
  );
}

export async function shutdownCliServer() {
  await cliState?.server.shutdown();
}

export function getCliState() {
  const { binDir, socketPath } = requireCliState();
  return {
    commandName: CLI_COMMAND_NAME,
    cliDirectory: binDir,
    socketPath,
  };
}
