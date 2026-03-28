import type { HandlerMap } from "./types";

const api = window.conduit;

/**
 * Convert an HTML canvas element to a Uint8Array PNG buffer.
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
  "canvas-capture": async ({ paneId }, context) => {
    const { canvas } = context.resolveCanvasPane(paneId);

    // Export the canvas to a temporary PNG file
    const buffer = await canvasToBuffer(canvas);
    const filePath = await api.writeTempFile(buffer, "png");

    return filePath;
  },
};
