import { randomUUID } from "node:crypto";
import net from "node:net";

import type { CliCommand, CliRequest, CliResponse } from "../shared/cli";

export async function sendCommand(command: CliCommand): Promise<CliResponse> {
  const socketPath = process.env.CONDUIT_SOCKET_PATH;
  const sessionId = process.env.CONDUIT_SESSION_ID;

  return new Promise<CliResponse>((resolve, reject) => {
    // Connect to the Conduit IPC server and send the provided command
    const socket = net.createConnection({ path: socketPath }, () => {
      const payload = JSON.stringify({
        requestId: randomUUID(),
        sessionId,
        command,
      } as CliRequest);
      socket.write(`${payload}\n`);
    });

    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const segments = buffer.split("\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        if (!segment.trim()) continue;

        let response: CliResponse;
        try {
          response = JSON.parse(segment) as CliResponse;
        } catch (error) {
          socket.destroy();
          reject("Received malformed response from Conduit IPC socket.");
          return;
        }

        if (response.status === "ok") {
          resolve(response);
          socket.end();
        } else {
          socket.destroy();
          reject(response.message);
        }
      }
    });

    socket.on("error", (error) => {
      socket.destroy();
      reject(
        `Unable to connect to Conduit IPC socket (${error.message}). Is the app running?`,
      );
    });

    socket.on("end", () => {
      if (buffer.trim().length === 0) {
        socket.destroy();
        reject("Connection closed before response was received.");
      }
    });
  });
}
