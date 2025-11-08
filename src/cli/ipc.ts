import { randomUUID } from "node:crypto";
import net from "node:net";
import type { CliCommand, CliRequest, CliResponse } from "../shared/cli";

// Grab the environment details that were set by the main
// process when it spawned the terminal the CLI is running in.
const socketPath = process.env.CONDUIT_SOCKET_PATH;
const sessionId = process.env.CONDUIT_SESSION_ID;

export async function sendCliRequest(
  command: CliCommand,
): Promise<CliResponse> {
  return new Promise<CliResponse>((resolve, reject) => {
    // Connect to the Conduit IPC socket and send the requested command
    const socket = net.createConnection({ path: socketPath }, () => {
      const request = JSON.stringify({
        requestId: randomUUID(),
        sessionId,
        command,
      } as CliRequest);
      socket.write(`${request}\n`);
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
      if (!message) {
        rejectSocket("Received empty response");
        return;
      }

      let response: CliResponse;
      try {
        response = JSON.parse(message) as CliResponse;
      } catch (error) {
        rejectSocket("Received malformed response");
        return;
      }

      if (response.status === "ok") {
        resolve(response);
        socket.end();
      } else {
        rejectSocket(response.message);
      }
    });

    socket.on("error", (error) =>
      rejectSocket(`Error occured: ${error.message}`),
    );

    socket.on("end", () => {
      if (buffer.trim().length === 0) {
        rejectSocket("No response received");
      }
    });

    function rejectSocket(reason: string) {
      socket.destroy();
      reject(`${reason}.`);
    }
  });
}
