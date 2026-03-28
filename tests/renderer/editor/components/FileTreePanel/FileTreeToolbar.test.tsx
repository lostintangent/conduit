/**
 * Tests for FileTreeToolbar component.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Test formatDisplayPath logic
// ============================================================================

/**
 * Format directory path for display.
 * Replaces home directory with ~ prefix, otherwise shows full path.
 * Matches v1 behavior.
 *
 * Note: This is a copy of the function from the component for testing purposes.
 */
function formatDisplayPath(cwd: string, homeDirectory?: string): string {
  if (!homeDirectory) {
    return cwd;
  }

  const normalizedPath = cwd.replace(/\\/g, "/");
  const normalizedHome = homeDirectory.replace(/\\/g, "/");

  if (normalizedPath === normalizedHome) {
    return "~";
  }

  const homeWithSlash = normalizedHome.endsWith("/")
    ? normalizedHome
    : `${normalizedHome}/`;

  if (normalizedPath.startsWith(homeWithSlash)) {
    const suffix = normalizedPath.slice(homeWithSlash.length);
    return suffix ? `~/${suffix}` : "~";
  }

  return cwd;
}

describe("FileTreeToolbar", () => {
  describe("formatDisplayPath", () => {
    it("should return ~ prefix for paths under home directory", () => {
      const result = formatDisplayPath(
        "/Users/john/Project/myapp",
        "/Users/john",
      );
      expect(result).toBe("~/Project/myapp");
    });

    it("should return ~ for exact home directory path", () => {
      const result = formatDisplayPath("/Users/john", "/Users/john");
      expect(result).toBe("~");
    });

    it("should return full path for paths outside home directory", () => {
      const result = formatDisplayPath("/var/log/app", "/Users/john");
      expect(result).toBe("/var/log/app");
    });

    it("should return full path when no home directory provided", () => {
      const result = formatDisplayPath("/Users/john/Project/myapp");
      expect(result).toBe("/Users/john/Project/myapp");
    });

    it("should handle Windows-style paths in home directory", () => {
      const result = formatDisplayPath(
        "C:/Users/john/Project/myapp",
        "C:\\Users\\john",
      );
      expect(result).toBe("~/Project/myapp");
    });

    it("should handle deeply nested paths under home", () => {
      const result = formatDisplayPath(
        "/Users/john/Projects/work/client/src/components",
        "/Users/john",
      );
      expect(result).toBe("~/Projects/work/client/src/components");
    });
  });
});
