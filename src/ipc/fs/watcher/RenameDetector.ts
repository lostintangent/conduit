import path from "node:path";
import type { UnlinkMetadata } from "./types";

export class RenameDetector {
  private recentUnlinks: Map<string, UnlinkMetadata> = new Map();

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
   * Check if a file add is actually a rename
   * Returns old path if rename detected, null otherwise
   */
  detectRename(newFilePath: string): string | null {
    const newDir = path.dirname(newFilePath);

    for (const [oldPath, metadata] of this.recentUnlinks.entries()) {
      const timeDiff = Date.now() - metadata.timestamp;

      // Must be within 500ms window
      if (timeDiff > 500) continue;

      const oldDir = path.dirname(oldPath);

      // Must be in same directory (simple rename, not move)
      if (oldDir !== newDir) continue;

      // Found a match - remove from tracking
      this.recentUnlinks.delete(oldPath);
      return oldPath;
    }

    return null;
  }

  /**
   * Clear all tracked unlinks
   */
  clear(): void {
    this.recentUnlinks.clear();
  }
}
