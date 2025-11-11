import { randomUUID } from "node:crypto";
import net from "node:net";
import type { CliCommand, CliRequest, CliResponse } from "../shared/cli/types";
import { processCliMessage } from "../shared/cli/protocol";

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

    processCliMessage<CliResponse>(socket)
      .then((response) => {
        if (response.status === "ok") {
          resolve(response);
          socket.end();
        } else {
          rejectSocket(response.message);
        }
      })
      .catch((reason) => {
        const message = typeof reason === "string" ? reason : undefined;
        rejectSocket(message);
      });

    function rejectSocket(reason: string | undefined) {
      socket.destroy();
      const message = reason ?? "Unknown error.";
      reject(message.endsWith(".") ? message : `${message}.`);
    }
  });
}
