#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { CliCommand, CliRequest, CliResponse } from "../shared/cli";

const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  APP_NOT_RUNNING: 3,
  FILE_NOT_FOUND: 4,
};

type ResolvedTarget = {
  cwd: string;
  filePath: string | null;
};

async function resolvePath(rawPath: string): Promise<ResolvedTarget> {
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);

  let stats: Stats;
  try {
    stats = await fs.stat(resolved);
  } catch (error: unknown) {
    throw new Error(`No such file or directory: ${rawPath}`);
  }

  if (stats.isDirectory()) {
    return { cwd: resolved, filePath: null };
  }

  return { cwd: path.dirname(resolved), filePath: resolved };
}

async function sendCommand(command: CliCommand, socketPath: string) {
  return new Promise<CliResponse>((resolve, reject) => {
    const socket = net.createConnection(
      socketPath.startsWith("\\\\.")
        ? { path: socketPath }
        : { path: socketPath },
      () => {
        const payload = JSON.stringify({
          requestId: randomUUID(),
          command,
        } as CliRequest);
        socket.write(`${payload}\n`);
      }
    );

    let buffer = "";

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const segments = buffer.split("\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        if (!segment.trim()) continue;
        try {
          const response = JSON.parse(segment) as CliResponse;
          resolve(response);
          socket.end();
        } catch (error) {
          reject(
            new Error(
              `Received invalid response from Conduit main process: ${error}`
            )
          );
          socket.destroy();
        }
      }
    });

    socket.on("error", (error) => {
      reject(
        new Error(
          `Unable to connect to Conduit IPC socket (${error.message}). Is the app running?`
        )
      );
    });

    socket.on("end", () => {
      if (buffer.trim().length === 0) {
        reject(new Error("Connection closed before response was received."));
      }
    });
  });
}

function printUsage(message?: string) {
  if (message) {
    console.error(message);
    console.error("");
  }

  console.error("Usage:");
  console.error("  conduit <path>");
  console.error("  conduit open-file <path>");
  console.error("");
  console.error("Options:");
  console.error("  -h, --help        Show this help message");
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(EXIT_CODES.SUCCESS);
  }

  if (args.length === 0) {
    printUsage("Missing <path> argument.");
    process.exit(EXIT_CODES.USAGE_ERROR);
  }

  const [firstArg] = args;
  let rawPathInput: string | undefined;

  if (firstArg === "open-file") {
    rawPathInput = args[1];
  } else if (firstArg?.startsWith("-")) {
    printUsage(`Unknown option: ${firstArg}`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  } else {
    rawPathInput = firstArg;
  }

  if (!rawPathInput) {
    printUsage("Missing <path> argument.");
    process.exit(EXIT_CODES.USAGE_ERROR);
  }

  const rawPath = rawPathInput;
  let resolvedTarget: ResolvedTarget;
  try {
    resolvedTarget = await resolvePath(rawPath);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if ((err as { code?: string }).code === "ENOENT") {
      console.error(err.message);
      process.exit(EXIT_CODES.FILE_NOT_FOUND);
    } else {
      console.error(err.message);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  }

  const socketPath = process.env.CONDUIT_SOCKET_PATH;
  if (!socketPath) {
    console.error(
      "CONDUIT_SOCKET_PATH is not set. Please run this command from a Conduit terminal session."
    );
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }

  try {
    const response = await sendCommand(
      {
        type: "open-file",
        ...resolvedTarget,
      },
      socketPath
    );

    if (response.status === "ok") {
      if (response.message) {
        console.log(response.message);
      }
      process.exit(EXIT_CODES.SUCCESS);
    } else {
      console.error(response.message);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_CODES.APP_NOT_RUNNING);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT_CODES.GENERAL_ERROR);
});
