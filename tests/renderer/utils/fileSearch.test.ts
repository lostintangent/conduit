/**
 * File Search Tests
 *
 * Tests for the file search functionality that uses IPC to search files
 * in the current directory tree.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchFiles } from "@/utils/fileSearch";
import type { FileSearchResult } from "@/utils/fileSearch.types";

// Mock the window.conduit API
const mockSearchFiles = vi.fn();

describe("fileSearch", () => {
  beforeEach(() => {
    // Set up window.conduit mock
    vi.stubGlobal("window", {
      conduit: {
        searchFiles: mockSearchFiles,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("searchFiles", () => {
    it("should call the IPC searchFiles API with correct parameters", async () => {
      const mockResults: FileSearchResult[] = [
        {
          path: "/test/path/file1.ts",
          name: "file1.ts",
          relativePath: "file1.ts",
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      const results = await searchFiles("/test/path", "file1", 50);

      expect(mockSearchFiles).toHaveBeenCalledWith({
        rootPath: "/test/path",
        query: "file1",
        maxResults: 50,
      });
      expect(results).toEqual(mockResults);
    });

    it("should return empty array if API is not available", async () => {
      vi.stubGlobal("window", {
        conduit: null,
      });

      const results = await searchFiles("/test/path", "query");

      expect(results).toEqual([]);
    });

    it("should return empty array if searchFiles API is not available", async () => {
      vi.stubGlobal("window", {
        conduit: {},
      });

      const results = await searchFiles("/test/path", "query");

      expect(results).toEqual([]);
    });

    it("should handle API errors gracefully", async () => {
      mockSearchFiles.mockRejectedValue(new Error("IPC Error"));

      const results = await searchFiles("/test/path", "query");

      expect(results).toEqual([]);
    });

    it("should use default maxResults of 100", async () => {
      mockSearchFiles.mockResolvedValue([]);

      await searchFiles("/test/path", "query");

      expect(mockSearchFiles).toHaveBeenCalledWith({
        rootPath: "/test/path",
        query: "query",
        maxResults: 100,
      });
    });

    it("should handle multiple search results", async () => {
      const mockResults: FileSearchResult[] = [
        {
          path: "/project/src/components/Button.tsx",
          name: "Button.tsx",
          relativePath: "src/components/Button.tsx",
        },
        {
          path: "/project/src/components/ButtonGroup.tsx",
          name: "ButtonGroup.tsx",
          relativePath: "src/components/ButtonGroup.tsx",
        },
        {
          path: "/project/tests/Button.test.tsx",
          name: "Button.test.tsx",
          relativePath: "tests/Button.test.tsx",
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      const results = await searchFiles("/project", "button", 100);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe("Button.tsx");
      expect(results[1].name).toBe("ButtonGroup.tsx");
      expect(results[2].name).toBe("Button.test.tsx");
    });

    it("should respect maxResults limit", async () => {
      const mockResults: FileSearchResult[] = [
        {
          path: "/project/file1.ts",
          name: "file1.ts",
          relativePath: "file1.ts",
        },
        {
          path: "/project/file2.ts",
          name: "file2.ts",
          relativePath: "file2.ts",
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      await searchFiles("/project", "file", 2);

      expect(mockSearchFiles).toHaveBeenCalledWith({
        rootPath: "/project",
        query: "file",
        maxResults: 2,
      });
    });

    it("should handle empty search results", async () => {
      mockSearchFiles.mockResolvedValue([]);

      const results = await searchFiles("/project", "nonexistent");

      expect(results).toEqual([]);
    });

    it("should work with different file types", async () => {
      const mockResults: FileSearchResult[] = [
        {
          path: "/project/README.md",
          name: "README.md",
          relativePath: "README.md",
        },
        {
          path: "/project/package.json",
          name: "package.json",
          relativePath: "package.json",
        },
        {
          path: "/project/tsconfig.json",
          name: "tsconfig.json",
          relativePath: "tsconfig.json",
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      const results = await searchFiles("/project", "json");

      expect(results).toHaveLength(3);
      expect(results.some((r) => r.name.endsWith(".json"))).toBe(true);
    });
  });
});
