import path from "node:path";
import type { UnlinkMetadata } from "./types";

export class RenameDetector {
  private recentUnlinks: Map<string, UnlinkMetadata> = new Map();
  private recentCreates: Map<string, number> = new Map(); // path -> timestamp

  /**
   * Record a file creation for potential rename detection
   */
  recordCreate(filePath: string): void {
    this.recentCreates.set(filePath, Date.now());

    // Auto-cleanup after 500ms
    setTimeout(() => {
      this.recentCreates.delete(filePath);
    }, 500);
  }

  /**
   * Record a file deletion for potential rename detection
   */
  recordUnlink(filePath: string): void {
    this.recentUnlinks.set(filePath, {
      timestamp: Date.now(),
      size: 0,
      mtimeMs: 0,
    });

    // Auto-cleanup after 500ms
    setTimeout(() => {
      this.recentUnlinks.delete(filePath);
    }, 500);
  }

  /**
   * Check if a CREATE event is actually a rename (DELETE came first)
   * Returns old path if rename detected, null otherwise
   */
  detectRenameFromCreate(newFilePath: string): string | null {
    const newDir = path.dirname(newFilePath);

    for (const [oldPath, metadata] of this.recentUnlinks.entries()) {
      const timeDiff = Date.now() - metadata.timestamp;
      const oldDir = path.dirname(oldPath);

      // Must be within 500ms window
      if (timeDiff > 500) {
        continue;
      }

      // Must be in same directory (simple rename, not move)
      if (oldDir !== newDir) {
        continue;
      }

      // Must be different files (not a create of the same file that was just deleted)
      if (newFilePath === oldPath) {
        continue;
      }

      // Found a match - remove from tracking
      this.recentUnlinks.delete(oldPath);
      return oldPath;
    }

    return null;
  }

  /**
   * Check if a DELETE event is actually a rename (CREATE came first)
   * Returns new path if rename detected, null otherwise
   */
  detectRenameFromDelete(oldFilePath: string): string | null {
    const oldDir = path.dirname(oldFilePath);

    for (const [newPath, timestamp] of this.recentCreates.entries()) {
      const timeDiff = Date.now() - timestamp;
      const newDir = path.dirname(newPath);

      // Must be within 500ms window
      if (timeDiff > 500) {
        continue;
      }

      // Must be in same directory (simple rename, not move)
      if (oldDir !== newDir) {
        continue;
      }

      // Must be different files (not a delete of the same file that was just created)
      if (oldFilePath === newPath) {
        continue;
      }

      // Found a match - remove from tracking
      this.recentCreates.delete(newPath);
      return newPath;
    }

    return null;
  }

  /**
   * Clear all tracked unlinks and creates
   */
  clear(): void {
    this.recentUnlinks.clear();
    this.recentCreates.clear();
  }
}
