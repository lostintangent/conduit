import { randomUUID } from "node:crypto";
import net from "node:net";
import { processCliMessage } from "../../shared/cli/protocol";
import type {
  CliCommand,
  CliRequest,
  CliResponse,
} from "../../shared/cli/types";
import type { ExtractArgs } from "./index";

// When the main process spawns a terminal, it will expose
// the ID of the session, and the socket path of the CLI server.
const socketPath = process.env.CONDUIT_SOCKET_PATH;
const sessionId = process.env.CONDUIT_SESSION_ID;

/**
 * Send a CLI command to the IPC server listening in the main process.
 *
 * @param name The name of the CLI command to send.
 * @param args Optional arguments for the command.
 * @returns The result from calling the IPC server.
 */
export async function sendCliCommand<
  Name extends CliCommand["name"],
  Result = undefined,
>(name: Name, args?: ExtractArgs<Name>) {
  // Build the CLI request message.
  const command = { name, args } as CliCommand;
  const request = JSON.stringify({
    requestId: randomUUID(),
    sessionId,
    command,
  } as CliRequest);

  // Connect to the CLI server and send the request
  // as soon as the connection is established.
  const socket = net.createConnection({ path: socketPath }, () =>
    socket.write(`${request}\n`),
  );

  // Wait for and process the response from the server.
  const response = await processCliMessage<CliResponse<Result>>(socket, true);

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result;
}
