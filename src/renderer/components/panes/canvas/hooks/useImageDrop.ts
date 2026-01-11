/**
 * Hook for handling image drag and drop onto the canvas pane.
 *
 * When an image file is dragged over the canvas, shows an overlay.
 * When dropped, converts it to base64 and adds it as an image element.
 */

import type { CanvasElement } from "@shared/types/canvas";
import { createImageElement } from "@shared/types/canvas";
import { getImageFile, hasImageFile } from "@/utils/dragDrop";
import { useCallback, useState } from "react";

// =============================================================================
// Types
// =============================================================================

export interface UseImageDropOptions {
  /** Function to add an element to the canvas */
  addElement: (element: CanvasElement) => void;
  /** Function to record the add for undo */
  recordAdd: (elements: CanvasElement[]) => void;
  /** Function to select the newly added element */
  selectElements: (ids: string[]) => void;
  /** Function to switch to the select tool after adding an image */
  switchToSelectTool: () => void;
  /** Canvas size for centering the dropped image */
  canvasSize: { width: number; height: number };
  /** Current viewport for coordinate transformation */
  viewport: { zoom: number; panX: number; panY: number };
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
// Helpers
// =============================================================================

/** Convert a File to base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Load an image and get its dimensions */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// =============================================================================
// Hook
// =============================================================================

export function useImageDrop({
  addElement,
  recordAdd,
  selectElements,
  switchToSelectTool,
  canvasSize,
  viewport,
}: UseImageDropOptions): UseImageDropResult {
  const [isImageDragOver, setIsImageDragOver] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasImageFile(e)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsImageDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset if leaving the container (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsImageDragOver(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      const imageFile = getImageFile(e);
      if (!imageFile) return;

      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(false);

      try {
        // Convert file to base64
        const dataUrl = await fileToBase64(imageFile);
        const base64 = dataUrl.split(",")[1];

        // Load image to get dimensions
        const img = await loadImage(dataUrl);

        // Calculate center position in canvas coordinates
        const centerX = canvasSize.width / 2 / viewport.zoom - viewport.panX;
        const centerY = canvasSize.height / 2 / viewport.zoom - viewport.panY;

        // Create and add the image element
        const imageElement = createImageElement(
          base64,
          imageFile.type,
          { width: img.width, height: img.height },
          centerX,
          centerY,
        );

        addElement(imageElement);
        recordAdd([imageElement]);
        selectElements([imageElement.id]);
        switchToSelectTool();
      } catch (err) {
        console.error("Failed to process dropped image:", err);
      }
    },
    [
      addElement,
      recordAdd,
      selectElements,
      switchToSelectTool,
      canvasSize,
      viewport,
    ],
  );

  return {
    isImageDragOver,
    dragHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
