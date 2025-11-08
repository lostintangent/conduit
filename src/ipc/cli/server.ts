import fs from "node:fs/promises";
import net from "node:net";
import type { CliRequest, CliResponse } from "../../shared/cli";

export type SendToRendererFn = (channel: string, payload: unknown) => void;

export type CliServer = {
  socketPath: string;
  respond: (response: CliResponse) => void;
  shutdown: (reason?: string) => Promise<void>;
};

const pendingRequests = new Map<string, net.Socket>();

function respondWithSocket(socket: net.Socket, response: Partial<CliResponse>) {
  try {
    socket.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    console.warn("Failed to respond to CLI request:", error);
  } finally {
    socket.end();
  }
}

function forwardResponseToCli(response: CliResponse) {
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
  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\n")) {
        return;
      }

      const message = buffer.slice(0, -1).trim();
      if (!message) {
        respondWithSocket(socket, {
          status: "error",
          message: "Invalid request: empty message.",
        });
        return;
      }

      try {
        const request = JSON.parse(message) as CliRequest;
        forwardRequestToRenderer(request, socket);
      } catch (error) {
        respondWithSocket(socket, {
          status: "error",
          message: `Invalid request: ${error.message}`,
        });
      }
    });

    socket.on("error", (error) => console.warn("CLI socket error:", error));
  });

  // Start the server and wait for it to begin listening
  await new Promise<void>((resolve, reject) => {
    cleanupSocket(socketPath);
    server.once("error", reject);

    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  async function cleanupSocket(socketPath: string) {
    if (process.platform === "win32") return;

    try {
      await fs.unlink(socketPath);
    } catch {
      // Ignore errors if socket file doesn't exist
    }
  }

  function forwardRequestToRenderer(request: CliRequest, socket: net.Socket) {
    // Keep track of the pending request so that we
    // can proxy the response when we get it from the renderer.
    pendingRequests.set(request.requestId, socket);
    socket.once("close", () => {
      pendingRequests.delete(request.requestId);
    });

    sendToRenderer("cli:request", request);
  }

  async function shutdown(reason?: string) {
    // Close any pending requests
    for (const [requestId, pending] of pendingRequests) {
      respondWithSocket(pending, {
        status: "error",
        message: reason ?? "Conduit is shutting down.",
      });
      pendingRequests.delete(requestId);
    }

    // Close the server
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  return {
    socketPath,
    respond: forwardResponseToCli,
    shutdown,
  };
}
