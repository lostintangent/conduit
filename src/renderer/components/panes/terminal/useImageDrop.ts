import { applicationModeAtom } from "@/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";

const api = window.conduit;

interface UseImageDropOptions {
  sessionId: string;
}

const hasImageFile = (e: React.DragEvent) =>
  Array.from(e.dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );

const getImageFile = (e: React.DragEvent) =>
  Array.from(e.dataTransfer.files).find((file) =>
    file.type.startsWith("image/"),
  );

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

      // Copy image to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ [imageFile.type]: imageFile }),
      ]);

      // Small delay to ensure clipboard is ready before sending paste
      setTimeout(() => {
        api.sendKeypress(sessionId, "\u0016");
      }, 50);
    },
    [applicationMode, sessionId],
  );

  return {
    isImageDragOver,
    dragHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
