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
      buffer += chunk.toString("utf8");
      const messages = buffer.split("\n");
      buffer = messages.pop() ?? "";

      for (const message of messages) {
        if (!message.trim()) continue;

        try {
          const parsed = JSON.parse(message) as CliRequest;
          handleCliRequest(parsed, socket);
        } catch (error) {
          respondWithSocket(socket, {
            status: "error",
            message: `Invalid request payload: ${error instanceof Error ? error.message : error}`,
          });
        }
      }
    });

    socket.on("error", (error) => {
      console.warn("CLI socket error:", error);
    });
  });

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
