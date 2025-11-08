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
      // Keep accumulating data until we hit a newline,
      // which indicates that the server has finished.
      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\n")) {
        return;
      }

      // We have a complete message, try to parse it
      const message = buffer.slice(0, -1).trim();
      buffer = "";

      if (!message) {
        return rejectAndDestroy("Received empty response");
      }

      let response: CliResponse;
      try {
        response = JSON.parse(message) as CliResponse;
      } catch (error) {
        return rejectAndDestroy("Received malformed response.");
      }

      if (response.status === "ok") {
        resolve(response);
        socket.end();
      } else {
        rejectAndDestroy(response.message);
      }
    });

    socket.on("error", (error) =>
      rejectAndDestroy(`Error occured: ${error.message}).`),
    );

    socket.on("end", () => {
      if (buffer.trim().length === 0) {
        rejectAndDestroy("Connection closed before response was received.");
      }
    });

    function rejectAndDestroy(reason: string) {
      socket.destroy();
      reject(reason);
    }
  });
}
