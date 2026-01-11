import type { HandlerMap } from "./types";

/**
 * Convert a canvas to a Uint8Array PNG buffer.
 * Uses toBlob() for efficiency - avoids base64 encoding overhead.
 */
function canvasToBuffer(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Failed to capture canvas"));
        return;
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      resolve(buffer);
    }, "image/png");
  });
}

export const canvasHandlers: Partial<HandlerMap> = {
  "canvas-capture": async (args, context) => {
    const { canvas } = context.resolveCanvasPane(args?.paneId);

    // Export canvas to PNG buffer
    const buffer = await canvasToBuffer(canvas);

    // Write to temp file and return the path
    const filePath = await window.conduit.writeTempFile(buffer, "png");

    return filePath;
  },
};
