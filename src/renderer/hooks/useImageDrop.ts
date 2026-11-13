/**
 * Hook for handling image drag and drop onto a pane (canvas, terminal).
 *
 * When an image file is dragged over the pane, shows an overlay.
 * When dropped, calls the provided handler with the image file.
 */

import { getImageFile, hasImageFile } from "@/utils/dragDrop";
import { useCallback, useState } from "react";

// =============================================================================
// Types
// =============================================================================

export interface UseImageDropOptions {
  /** When false, image drags are ignored (default: true) */
  enabled?: boolean;
  /** Called when an image file is dropped */
  onImageDrop: (file: File) => Promise<void>;
}

export interface UseImageDropResult {
  /** Whether an image is currently being dragged over */
  isImageDragOver: boolean;
  /** Drag event handlers to spread onto the container */
  dragHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useImageDrop({
  enabled = true,
  onImageDrop,
}: UseImageDropOptions): UseImageDropResult {
  const [isImageDragOver, setIsImageDragOver] = useState(false);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!enabled || !hasImageFile(e)) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsImageDragOver(true);
    },
    [enabled],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset if leaving the container (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsImageDragOver(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      const imageFile = getImageFile(e);
      if (!imageFile || !enabled) return;

      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(false);

      await onImageDrop(imageFile);
    },
    [enabled, onImageDrop],
  );

  return {
    isImageDragOver,
    dragHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
