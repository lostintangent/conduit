import net from "node:net";
import type {
  CliCommand,
  CliOpenFileRequestPayload,
  CliRequest,
  CliResponse,
} from "../../shared/cli";

export type SendToRendererFn = (channel: string, payload: unknown) => void;

type PendingRequest = {
  socket: net.Socket;
  timeout: NodeJS.Timeout | null;
};

export type CliServer = {
  socketPath: string;
  respond: (response: CliResponse) => void;
  shutdown: (reason?: string) => Promise<void>;
};

function respondWithSocket(socket: net.Socket, response: Omit<CliResponse, "requestId">) {
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
  timeoutMs = 15_000,
): Promise<CliServer> {
  const pendingRequests = new Map<string, PendingRequest>();

  function respondToCli(response: CliResponse) {
    const { requestId } = response;
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    respondWithSocket(pending.socket, response);
    pendingRequests.delete(requestId);
  }

  function handleCliRequest(request: CliRequest, socket: net.Socket) {
    if (request.command.type !== "open-file") {
      respondWithSocket(socket, {
        status: "error",
        message: `Unsupported CLI command: ${(request.command as CliCommand).type}`,
      });
      return;
    }

    const payload: CliOpenFileRequestPayload = {
      requestId: request.requestId,
      filePath: request.command.filePath,
      cwd: request.command.cwd,
    };

    const timeout = setTimeout(() => {
      respondToCli({
        requestId: request.requestId,
        status: "error",
        message: "Timed out waiting for Conduit UI to handle request.",
      });
    }, timeoutMs);

    pendingRequests.set(request.requestId, { socket, timeout });

    socket.once("close", () => {
      const pending = pendingRequests.get(request.requestId);
      if (pending && pending.socket === socket) {
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        pendingRequests.delete(request.requestId);
      }
    });

    sendToRenderer("cli:open-file", payload);
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
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      respondWithSocket(pending.socket, {
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
