/**
 * Shared drag and drop utilities.
 *
 * This module provides common helpers for drag-and-drop operations across
 * different pane types (canvas, terminal) and the layout system.
 */

import type React from "react";
import type { SplitDirection } from "@/types";

// =============================================================================
// Image Drag Helpers
// =============================================================================

/**
 * Check if a drag event contains an image file.
 */
export function hasImageFile(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
}

/**
 * Get the first image file from a drag event.
 */
export function getImageFile(e: React.DragEvent): File | undefined {
  return Array.from(e.dataTransfer.files).find((file) =>
    file.type.startsWith("image/"),
  );
}

// =============================================================================
// Edge Zone Helpers
// =============================================================================

/**
 * Edge zone for drop targets (top, bottom, left, right).
 */
export type EdgeZone = "top" | "bottom" | "left" | "right";

/**
 * Convert an edge zone to split direction and insert position.
 */
export function getDirectionFromZone(zone: EdgeZone): {
  direction: SplitDirection;
  insertBefore: boolean;
} {
  switch (zone) {
    case "top":
      return { direction: "column", insertBefore: true };
    case "bottom":
      return { direction: "column", insertBefore: false };
    case "left":
      return { direction: "row", insertBefore: true };
    case "right":
      return { direction: "row", insertBefore: false };
  }
}
