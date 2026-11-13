const api = window.conduit;

// Convert image to PNG blob (Clipboard API only supports PNG)
const toPngBlob = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to convert image to PNG"));
        }, "image/png");
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Paste a dropped image into the session by copying it to the clipboard and sending Ctrl+V
export async function pasteImage(sessionId: string, file: File) {
  try {
    const pngBlob = await toPngBlob(file);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": pngBlob }),
    ]);

    // Small delay to ensure clipboard is ready before sending paste
    setTimeout(() => {
      api.sendKeypress(sessionId, "\u0016");
    }, 50);
  } catch (err) {
    console.error("Failed to process dropped image:", err);
  }
}
