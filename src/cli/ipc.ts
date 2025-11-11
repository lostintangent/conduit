import { randomUUID } from "node:crypto";
import net from "node:net";
import { processCliMessage } from "../shared/cli/protocol";
import type { CliCommand, CliRequest, CliResponse } from "../shared/cli/types";

// When the main process spawns a terminal, it will expose
// the ID of the session, and the socket path of the CLI server.
const socketPath = process.env.CONDUIT_SOCKET_PATH;
const sessionId = process.env.CONDUIT_SESSION_ID;

/**
 * Send a CLI command to the IPC server listening in the main process.
 *
 * @param command The CLI command to send.
 * @returns The result from calling the IPC server.
 */
export async function sendCliCommand<ResultType = void>(command: CliCommand) {
  // Connect to the CLI server and send the request
  // when the connection is established.
  const socket = net.createConnection({ path: socketPath }, () => {
    const request = JSON.stringify({
      requestId: randomUUID(),
      sessionId,
      command,
    } as CliRequest);

    socket.write(`${request}\n`);
  });

  // Wait for and process the response from the server.
  const response = await processCliMessage<CliResponse<ResultType>>(
    socket,
    true,
  );

  if ("error" in response) {
    throw new Error(response.error);
  } else {
    return response.result;
  }
}
