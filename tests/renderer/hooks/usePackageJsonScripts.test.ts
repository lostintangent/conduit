/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window.conduit BEFORE importing the hook - must be at module level
const mockReadFile = vi.fn();
(global as any).window = {
  conduit: {
    fsv2: {
      readFile: mockReadFile,
    },
  },
};

import { usePackageJsonScripts } from "@/hooks/usePackageJsonScripts";

describe("usePackageJsonScripts", () => {
  beforeEach(() => {
    mockReadFile.mockReset();
  });

  it("should return null when no cwd provided", async () => {
    const { result } = renderHook(() => usePackageJsonScripts(undefined));

    // Wait a bit for the effect to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
    expect(result.current.packageJsonPath).toBeUndefined();
  });

  it("should find and parse package.json in current directory", async () => {
    const mockPackageJson = {
      name: "test-project",
      scripts: {
        start: "node index.js",
        test: "vitest",
        build: "tsc",
      },
    };

    // Mock expects (cwd, absolutePath) - the hook now passes absolute path
    mockReadFile.mockImplementation((cwd, filePath) => {
      if (filePath === "/path/to/project/package.json") {
        return Promise.resolve(
          new TextEncoder().encode(JSON.stringify(mockPackageJson)),
        );
      }
      return Promise.reject(new Error("File not found"));
    });

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    // Wait for async operation
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toEqual(mockPackageJson.scripts);
    expect(result.current.packageJsonPath).toBe(
      "/path/to/project/package.json",
    );
  });

  it("should search parent directories when not found in current", async () => {
    const mockPackageJson = {
      scripts: {
        dev: "npm run watch",
      },
    };

    // Mock implementation that fails for subdir but succeeds for parent
    mockReadFile.mockImplementation((cwd, filePath) => {
      // Fail for /path/to/project/subdir/package.json
      if (filePath === "/path/to/project/subdir/package.json") {
        return Promise.reject(new Error("File not found"));
      }
      // Succeed for /path/to/project/package.json
      if (filePath === "/path/to/project/package.json") {
        return Promise.resolve(
          new TextEncoder().encode(JSON.stringify(mockPackageJson)),
        );
      }
      return Promise.reject(new Error("File not found"));
    });

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project/subdir"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toEqual(mockPackageJson.scripts);
  });

  it("should return null when package.json not found", async () => {
    mockReadFile.mockRejectedValue(new Error("File not found"));

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
    expect(result.current.packageJsonPath).toBeUndefined();
  });

  it("should return null when package.json has no scripts", async () => {
    const mockPackageJson = {
      name: "test-project",
      version: "1.0.0",
    };

    mockReadFile.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(mockPackageJson)),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
  });

  it("should handle invalid JSON gracefully", async () => {
    mockReadFile.mockResolvedValue(
      new TextEncoder().encode("{ invalid json }"),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
  });
});
