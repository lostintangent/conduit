import { app, ipcMain, webContents } from "electron";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
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
  } catch {
    // Ignore errors if socket file doesn't exist
  }
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

async function writeCaptureToTempFile(buffer: Buffer) {
  const fileName = `conduit-${randomUUID()}.png`;
  const filePath = path.join(tmpdir(), fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function respondToCli(requestId: string, response: Omit<CliResponse, "requestId">) {
  if (!cliState) return;

  cliState.server.respond({
    requestId,
    ...response,
  });
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

  ipcMain.handle(
    "cli:capture-browser",
    async (
      _,
      payload: {
        requestId: string;
        paneId: string;
        webContentsId: number;
      },
    ) => {
      if (!cliState) {
        return;
      }

      const requestId = payload?.requestId;
      if (typeof requestId !== "string" || !requestId) {
        return;
      }

      const paneId = payload?.paneId;
      const { webContentsId } = payload ?? {};

      if (typeof webContentsId !== "number") {
        respondToCli(requestId, {
          status: "error",
          message: "Renderer did not provide a valid webContentsId for capture.",
        });
        return;
      }

      try {
        const contents = webContents.fromId(webContentsId);

        if (!contents) {
          throw new Error(
            paneId
              ? `Unable to locate webContents for pane "${paneId}".`
              : "Unable to locate webContents for requested pane.",
          );
        }

        const image = await contents.capturePage();
        const buffer = image.toPNG();
        const filePath = await writeCaptureToTempFile(buffer);

        respondToCli(requestId, {
          status: "ok",
          data: { filePath },
        });
      } catch (error) {
        respondToCli(requestId, {
          status: "error",
          message: `Failed to capture browser pane: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
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
    } catch {
      // Ignore errors if socket file doesn't exist
    }
  }

  cliState = null;
}
