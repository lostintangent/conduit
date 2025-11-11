import { app, ipcMain, webContents } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
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

function resolveSocketPath(baseDir: string) {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${CLI_COMMAND_NAME}-${process.pid}`;
  }

  return path.join(baseDir, "cli.sock");
}

async function prepareCliEnvironment(
  sendToRenderer: SendToRendererFn,
): Promise<CliState> {
  const baseDir = path.join(app.getPath("userData"), "cli");
  const binDir = path.join(baseDir, "bin");
  await fs.mkdir(binDir, { recursive: true });

  const electronBinary = process.execPath;
  const cliPath = path.join(app.getAppPath(), ".vite", "build", "cli.js");

  await ensureLauncherScripts(binDir, electronBinary, cliPath);

  const socketPath = resolveSocketPath(baseDir);
  const server = await createCliServer(socketPath, sendToRenderer);

  return {
    binDir,
    socketPath,
    server,
  };
}

function respondToCli(
  requestId: string,
  response: Omit<CliResponse, "requestId">,
) {
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
    cliState.server.respond(payload),
  );

  // See the note in useCliClient about why this is done in the main process.
  ipcMain.handle(
    "cli:complete-capture-browser",
    async (
      _,
      {
        requestId,
        webContentsId,
      }: {
        requestId: string;
        webContentsId: number;
      },
    ) => {
      try {
        const contents = webContents.fromId(webContentsId);

        const image = await contents.capturePage();
        const buffer = image.toPNG();

        const filePath = path.join(tmpdir(), `capture-${randomUUID()}.png`);
        await fs.writeFile(filePath, buffer);

        respondToCli(requestId, {
          status: "ok",
          data: filePath,
        });
      } catch (error) {
        respondToCli(requestId, {
          status: "error",
          message: "Failed to capture browser pane",
        });
      }
    },
  );
}

export async function shutdownCliServer() {
  await cliState.server.shutdown();
}

export function getCliState() {
  return {
    commandName: CLI_COMMAND_NAME,
    cliDirectory: cliState.binDir,
    socketPath: cliState.socketPath,
  };
}
