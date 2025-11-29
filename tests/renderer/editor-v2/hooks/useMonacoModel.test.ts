import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMonacoModel } from "../../../../src/renderer/components/panes/editor-v2/hooks/useMonacoModel";
import {
  MonacoModelRegistry,
  pathToUri,
} from "../../../../src/renderer/components/panes/editor-v2/registry";

// ============================================================================
// Mocks
// ============================================================================

// Mock the MonacoModelRegistry
const mockModel = {
  getValue: vi.fn(() => "file content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  uri: { toString: () => "file:///test/file.ts" },
  getAlternativeVersionId: vi.fn(() => 1),
  onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
};

const mockRegistry = {
  getOrCreateModel: vi.fn().mockResolvedValue(mockModel),
  addReference: vi.fn(),
  removeReference: vi.fn(),
  getModelState: vi.fn(() => null),
  getModel: vi.fn(() => mockModel),
};

vi.mock(
  "../../../../src/renderer/components/panes/editor-v2/registry",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../src/renderer/components/panes/editor-v2/registry")
      >();
    return {
      ...original,
      MonacoModelRegistry: {
        getInstance: () => mockRegistry,
        resetInstance: vi.fn(),
      },
    };
  },
);

// ============================================================================
// Tests
// ============================================================================

describe("useMonacoModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry.getOrCreateModel.mockResolvedValue(mockModel);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("basic functionality", () => {
    it("should return null initially while loading", async () => {
      const { result } = renderHook(() =>
        useMonacoModel("editor-1", "/test/file.ts", "/test"),
      );

      // Initially null while async loading
      expect(result.current).toBe(null);

      // Wait for the model to load
      await waitFor(() => {
        expect(result.current).toBe(mockModel);
      });
    });

    it("should return model for valid file path", async () => {
      const { result } = renderHook(() =>
        useMonacoModel("editor-1", "/test/file.ts", "/test"),
      );

      await waitFor(() => {
        expect(result.current).toBe(mockModel);
      });

      expect(mockRegistry.getOrCreateModel).toHaveBeenCalledWith(
        "/test/file.ts",
        "/test",
      );
    });

    it("should return null for null file path", () => {
      const { result } = renderHook(() =>
        useMonacoModel("editor-1", null, "/test"),
      );

      expect(result.current).toBe(null);
      expect(mockRegistry.getOrCreateModel).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Reference Counting
  // ===========================================================================

  describe("reference counting", () => {
    it("should add reference on mount with provided editorId", async () => {
      renderHook(() =>
        useMonacoModel("my-editor-id", "/test/file.ts", "/test"),
      );

      await waitFor(() => {
        expect(mockRegistry.addReference).toHaveBeenCalledWith(
          pathToUri("/test/file.ts"),
          "my-editor-id",
        );
      });
    });

    it("should remove reference on unmount with same editorId", async () => {
      const { unmount } = renderHook(() =>
        useMonacoModel("my-editor-id", "/test/file.ts", "/test"),
      );

      await waitFor(() => {
        expect(mockRegistry.addReference).toHaveBeenCalled();
      });

      unmount();

      expect(mockRegistry.removeReference).toHaveBeenCalledWith(
        pathToUri("/test/file.ts"),
        "my-editor-id",
      );
    });

    it("should not add/remove reference for null file path", () => {
      const { unmount } = renderHook(() =>
        useMonacoModel("editor-1", null, "/test"),
      );

      expect(mockRegistry.addReference).not.toHaveBeenCalled();

      unmount();

      expect(mockRegistry.removeReference).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // File Path Changes
  // ===========================================================================

  describe("file path changes", () => {
    it("should handle file path change correctly", async () => {
      const { result, rerender } = renderHook(
        ({ editorId, filePath, cwd }) =>
          useMonacoModel(editorId, filePath, cwd),
        {
          initialProps: {
            editorId: "editor-1",
            filePath: "/test/file1.ts",
            cwd: "/test",
          },
        },
      );

      await waitFor(() => {
        expect(result.current).toBe(mockModel);
      });

      const firstUri = pathToUri("/test/file1.ts");

      // Change to a different file
      rerender({
        editorId: "editor-1",
        filePath: "/test/file2.ts",
        cwd: "/test",
      });

      // Should remove reference from old file
      expect(mockRegistry.removeReference).toHaveBeenCalledWith(
        firstUri,
        "editor-1",
      );

      // Should get/create model for new file
      await waitFor(() => {
        expect(mockRegistry.getOrCreateModel).toHaveBeenCalledWith(
          "/test/file2.ts",
          "/test",
        );
      });
    });

    it("should handle change from file to null", async () => {
      const { result, rerender } = renderHook(
        ({ editorId, filePath, cwd }) =>
          useMonacoModel(editorId, filePath, cwd),
        {
          initialProps: {
            editorId: "editor-1",
            filePath: "/test/file.ts" as string | null,
            cwd: "/test",
          },
        },
      );

      await waitFor(() => {
        expect(result.current).toBe(mockModel);
      });

      // Change to null
      rerender({ editorId: "editor-1", filePath: null, cwd: "/test" });

      // Should remove reference
      expect(mockRegistry.removeReference).toHaveBeenCalledWith(
        pathToUri("/test/file.ts"),
        "editor-1",
      );

      // Model should be null
      expect(result.current).toBe(null);
    });

    it("should handle change from null to file", async () => {
      const { result, rerender } = renderHook(
        ({ editorId, filePath, cwd }) =>
          useMonacoModel(editorId, filePath, cwd),
        {
          initialProps: {
            editorId: "editor-1",
            filePath: null as string | null,
            cwd: "/test",
          },
        },
      );

      expect(result.current).toBe(null);
      expect(mockRegistry.getOrCreateModel).not.toHaveBeenCalled();

      // Change to a file
      rerender({
        editorId: "editor-1",
        filePath: "/test/file.ts",
        cwd: "/test",
      });

      await waitFor(() => {
        expect(result.current).toBe(mockModel);
      });

      expect(mockRegistry.getOrCreateModel).toHaveBeenCalledWith(
        "/test/file.ts",
        "/test",
      );
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should return null when model creation fails", async () => {
      // Make getOrCreateModel throw an error
      mockRegistry.getOrCreateModel.mockRejectedValueOnce(
        new Error("File not found"),
      );

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() =>
        useMonacoModel("editor-1", "/test/nonexistent.ts", "/test"),
      );

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      expect(result.current).toBe(null);

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Editor ID Consistency
  // ===========================================================================

  describe("editor ID consistency", () => {
    it("should use provided editorId for all operations", async () => {
      const { rerender } = renderHook(() =>
        useMonacoModel("consistent-editor-id", "/test/file.ts", "/test"),
      );

      await waitFor(() => {
        expect(mockRegistry.addReference).toHaveBeenCalled();
      });

      // Verify the provided editorId was used
      expect(mockRegistry.addReference).toHaveBeenCalledWith(
        pathToUri("/test/file.ts"),
        "consistent-editor-id",
      );

      // Re-render with same props
      rerender();

      // Should still use the same editor ID
      // (addReference should only be called once for the same file)
      expect(mockRegistry.addReference).toHaveBeenCalledTimes(1);
    });
  });
});
