import fs from "node:fs";
import net from "node:net";
import { processCliMessage } from "../../shared/cli/protocol";
import type { CliRequest, CliResponse } from "../../shared/cli/types";

export type SendToRendererFn = (channel: string, payload: unknown) => void;

export type CliServer = {
  socketPath: string;
  respond: <T>(response: CliResponse<T>) => void;
  shutdown: (reason?: string) => Promise<void>;
};

const pendingRequests = new Map<string, net.Socket>();

function respondWithSocket<T>(
  socket: net.Socket,
  response: Partial<CliResponse<T>>,
) {
  try {
    socket.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    console.warn("Failed to respond to CLI request:", error);
  } finally {
    socket.end();
  }
}

function forwardResponseToCli<T>(response: CliResponse<T>) {
  const { requestId } = response;
  const socket = pendingRequests.get(requestId);
  if (!socket) return;

  respondWithSocket(socket, response);
  pendingRequests.delete(requestId);
}

export async function createCliServer(
  socketPath: string,
  sendToRenderer: SendToRendererFn,
): Promise<CliServer> {
  const server = net.createServer(async (socket) => {
    try {
      // Process the incoming CLI request message and
      // then forward it on to the renderer process.
      const request = await processCliMessage<CliRequest>(socket);
      forwardRequestToRenderer(request, socket);
    } catch (error) {
      respondWithSocket(socket, {
        error: error.message,
      });
    }
  });

  // Start the server and wait for it to begin listening
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);

    cleanupSocket(socketPath);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  function cleanupSocket(socketPath: string) {
    if (process.platform === "win32") return;

    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  }

  function forwardRequestToRenderer(request: CliRequest, socket: net.Socket) {
    // Keep track of the pending request so that we
    // can proxy the response when we get it from the renderer.
    pendingRequests.set(request.requestId, socket);
    socket.once("close", () => pendingRequests.delete(request.requestId));

    sendToRenderer("cli:request", request);
  }

  async function shutdown() {
    // Close any pending requests
    for (const [requestId, socket] of pendingRequests) {
      respondWithSocket(socket, {
        error: "Conduit is shutting down.",
      });
      pendingRequests.delete(requestId);
    }

    // Close the server
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }

    cleanupSocket(socketPath);
  }

  return {
    socketPath,
    respond: forwardResponseToCli,
    shutdown,
  };
}
