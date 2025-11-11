import { randomUUID } from "node:crypto";
import net from "node:net";
import { processCliMessage } from "../shared/cli/protocol";
import type { CliCommand, CliRequest, CliResponse } from "../shared/cli/types";

// Grab the environment details that were set by the main
// process when it spawned the terminal the CLI is running in.
const socketPath = process.env.CONDUIT_SOCKET_PATH;
const sessionId = process.env.CONDUIT_SESSION_ID;

export async function sendCliRequest(
  command: CliCommand,
): Promise<CliResponse> {
  // Connect to the CLI server and send the request.
  const socket = net.createConnection({ path: socketPath }, () => {
    const request = JSON.stringify({
      requestId: randomUUID(),
      sessionId,
      command,
    } as CliRequest);

    socket.write(`${request}\n`);
  });

  // Wait for and process the response from the server.
  const response = await processCliMessage<CliResponse>(socket);
  if (response.status === "ok") {
    socket.end();
    return response;
  } else {
    socket.destroy();
    throw new Error(response.message);
  }
}
