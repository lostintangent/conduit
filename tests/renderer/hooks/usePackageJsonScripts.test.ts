/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock window.conduit BEFORE importing the hook - must be at module level
const mockReadFile = vi.fn();
(window as any).conduit = {
  fs: {
    readFile: mockReadFile,
  },
};

import { usePackageJsonScripts } from "@/hooks/usePackageJsonScripts";

describe("usePackageJsonScripts", () => {
  beforeEach(() => {
    mockReadFile.mockReset();
  });

  it("should return null when no cwd provided", async () => {
    const { result } = renderHook(() => usePackageJsonScripts(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
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

    // New API: readFile(cwd, filePath, sandboxId)
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

    await waitFor(() => expect(result.current.loading).toBe(false));
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

    // New API: readFile(cwd, filePath, sandboxId) - throw for subdir, succeed for parent
    mockReadFile.mockImplementation((cwd, filePath) => {
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

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scripts).toEqual(mockPackageJson.scripts);
  });

  it("should return null when package.json not found", async () => {
    // No package.json exists anywhere - all reads throw
    mockReadFile.mockRejectedValue(new Error("File not found"));

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
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

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scripts).toBeUndefined();
  });

  it("should handle invalid JSON gracefully", async () => {
    mockReadFile.mockResolvedValue(
      new TextEncoder().encode("{ invalid json }"),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scripts).toBeUndefined();
  });
});
