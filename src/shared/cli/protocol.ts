import type { Socket } from "node:net";

/**
 * Processes a CLI protocol message, which represents either
 * a request (on the server) or a response (on the client).
 *
 * @param socket The socket connection to process a message from
 * @returns A promise that resolves with the parsed message object.
 */
export function processCliMessage<T>(socket: Socket): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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
        reject("No message received.");
        return;
      }

      try {
        resolve(JSON.parse(message) as T);
      } catch (error) {
        reject(`Invalid message: ${error.message}.`);
      }
    });

    socket.on("end", () => {
      if (buffer.trim().length === 0) {
        reject("No message received.");
      }
    });

    socket.on("error", (error: Error) => reject(`Error: ${error.message}.`));
  });
}
