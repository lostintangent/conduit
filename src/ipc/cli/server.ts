import net from "node:net";
import type { CliRequest, CliResponse } from "../../shared/cli";

export type SendToRendererFn = (channel: string, payload: unknown) => void;

export type CliServer = {
  socketPath: string;
  respond: (response: CliResponse) => void;
  shutdown: (reason?: string) => Promise<void>;
};

function respondWithSocket(socket: net.Socket, response: Partial<CliResponse>) {
  try {
    socket.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    console.warn("Failed to respond to CLI request:", error);
  } finally {
    socket.end();
  }
}

export async function createCliServer(
  socketPath: string,
  sendToRenderer: SendToRendererFn,
): Promise<CliServer> {
  const pendingRequests = new Map<string, net.Socket>();

  function respondToCli(response: CliResponse) {
    const { requestId } = response;
    const socket = pendingRequests.get(requestId);
    if (!socket) return;

    respondWithSocket(socket, response);
    pendingRequests.delete(requestId);
  }

  function handleCliRequest(request: CliRequest, socket: net.Socket) {
    pendingRequests.set(request.requestId, socket);

    socket.once("close", () => {
      if (pendingRequests.get(request.requestId) === socket) {
        pendingRequests.delete(request.requestId);
      }
    });

    sendToRenderer("cli:request", request);
  }

  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      // Each CLI client sends exactly one newline-terminated request per socket
      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\n")) {
        return;
      }

      const message = buffer.slice(0, -1).trim();
      buffer = "";

      if (!message) {
        respondWithSocket(socket, {
          status: "error",
          message: "Invalid request: empty message.",
        });
        return;
      }

      try {
        const parsed = JSON.parse(message) as CliRequest;
        handleCliRequest(parsed, socket);
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
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  async function shutdown(reason?: string) {
    for (const [requestId, pending] of pendingRequests) {
      respondWithSocket(pending, {
        status: "error",
        message: reason ?? "Conduit is shutting down.",
      });
      pendingRequests.delete(requestId);
    }

    if (server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  }

  return {
    socketPath,
    respond: respondToCli,
    shutdown,
  };
}
