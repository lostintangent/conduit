import { applicationModeAtom } from "@/store/atoms";
import { getImageFile, hasImageFile } from "@/utils/dragDrop";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";

const api = window.conduit;

interface UseImageDropOptions {
  sessionId: string;
}

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

export function useImageDrop({ sessionId }: UseImageDropOptions) {
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const applicationMode = useAtomValue(applicationModeAtom);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (applicationMode !== "normal") return;
      if (!hasImageFile(e)) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsImageDragOver(true);
    },
    [applicationMode],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset if leaving the container (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsImageDragOver(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      const imageFile = getImageFile(e);
      if (!imageFile || applicationMode !== "normal") return;

      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(false);

      try {
        // Copy image to clipboard (convert to PNG since Clipboard API only supports PNG)
        const pngBlob = await toPngBlob(imageFile);
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
    },
    [applicationMode, sessionId],
  );

  return {
    isImageDragOver,
    dragHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
