import type { Socket } from "node:net";

/**
 * Processes a CLI protocol message, which represents either
 * a request (on the server) or a response (on the client).
 *
 * @param socket The socket connection to process a message from
 * @returns A promise that resolves with the parsed message object.
 */
export function processCliMessage<MessageType>(
  socket: Socket,
  closeOnResolve = false,
) {
  return new Promise<MessageType>((resolve, reject) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      // Keep accumulating data until we hit a newline,
      // which indicates the end of the message.
      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\n")) {
        return;
      }

      // Remove the trailing newline and reject an empty message.
      const message = buffer.slice(0, -1).trim();
      if (!message) {
        rejectAndDestroy("No message received.");
        return;
      }

      try {
        const parsed = JSON.parse(message) as MessageType;
        resolve(parsed);

        if (closeOnResolve) {
          socket.end();
        }
      } catch (error) {
        rejectAndDestroy(`Invalid message: ${error.message}.`);
      }
    });

    socket.once("end", () => {
      if (buffer.trim().length === 0) {
        rejectAndDestroy("No message received.");
      }
    });

    socket.once("error", (error: Error) =>
      rejectAndDestroy(`Error: ${error.message}.`),
    );

    function rejectAndDestroy(message: string) {
      socket.destroy();
      reject(new Error(message));
    }
  });
}
