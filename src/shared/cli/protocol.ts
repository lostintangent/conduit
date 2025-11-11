import type { Socket } from "node:net";

export function processCliMessage<T>(socket: Socket): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let buffer = "";
    let receivedData = false;
    let settled = false;

    const cleanup = () => {
      socket.off("data", handleChunk);
      socket.off("end", handleEnd);
      socket.off("error", handleError);
    };

    const normalizeReason = (reason: string) =>
      reason.endsWith(".") ? reason : `${reason}.`;

    const rejectSocket = (reason: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(normalizeReason(reason));
    };

    const resolveMessage = (message: T) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(message);
    };

    const handleChunk = (chunk: Buffer) => {
      if (chunk.length > 0) {
        receivedData = true;
      }

      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\n")) {
        return;
      }

      const message = buffer.slice(0, -1).trim();
      buffer = "";

      if (!message) {
        rejectSocket(
          receivedData ? "Received empty message" : "No message received",
        );
        return;
      }

      try {
        resolveMessage(JSON.parse(message) as T);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "unknown error";
        rejectSocket(`Invalid message: ${errorMessage}`);
      }
    };

    const handleEnd = () => {
      if (buffer.trim().length === 0) {
        rejectSocket(
          receivedData ? "Received empty message" : "No message received",
        );
      }
    };

    const handleError = (error: unknown) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "unknown error";
      rejectSocket(`Message error: ${errorMessage}`);
    };

    socket.on("data", handleChunk);
    socket.on("end", handleEnd);
    socket.on("error", handleError);
  });
}
