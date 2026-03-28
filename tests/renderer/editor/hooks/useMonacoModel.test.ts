import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMonacoModel } from "../../../../src/renderer/components/panes/editor/hooks/useMonacoModel";
import { createModelKey } from "../../../../src/renderer/components/panes/editor/registry";

// ============================================================================
// Mocks
// ============================================================================

// Mock the MonacoModelRegistry
const mockModel = {
  getValue: vi.fn(() => "file content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  isDisposed: vi.fn(() => false),
  uri: { toString: () => "file:///test/file.ts" },
  getAlternativeVersionId: vi.fn(() => 1),
  onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
};

// Store subscribers for model availability changes
const modelAvailabilitySubscribers: Map<string, Set<() => void>> = new Map();

const mockRegistry = {
  getOrCreateModel: vi.fn().mockResolvedValue(mockModel),
  addReference: vi.fn(),
  removeReference: vi.fn(),
  getModelState: vi.fn(() => null),
  getModel: vi.fn(() => mockModel),
  subscribeToModelAvailability: vi.fn(
    (modelKey: string, callback: () => void) => {
      if (!modelAvailabilitySubscribers.has(modelKey)) {
        modelAvailabilitySubscribers.set(modelKey, new Set());
      }
      modelAvailabilitySubscribers.get(modelKey)!.add(callback);
      return () => {
        modelAvailabilitySubscribers.get(modelKey)?.delete(callback);
      };
    },
  ),
};

vi.mock(
  "../../../../src/renderer/components/panes/editor/registry",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../src/renderer/components/panes/editor/registry")
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
    mockRegistry.getModel.mockReturnValue(mockModel); // Reset to return mockModel by default
    mockModel.isDisposed.mockReturnValue(false);
    modelAvailabilitySubscribers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("basic functionality", () => {
    it("should return model synchronously when cached (useSyncExternalStore optimization)", async () => {
      // With useSyncExternalStore, cached models are returned synchronously on first render
      const { result } = renderHook(() =>
        useMonacoModel("editor-1", "/test/file.ts", "/test"),
      );

      // Model is available immediately because getModel returns it
      expect(result.current).toBe(mockModel);

      // getOrCreateModel is NOT called when model is already cached
      expect(mockRegistry.getOrCreateModel).not.toHaveBeenCalled();
    });

    it("should trigger async load for cache miss", async () => {
      // Make getModel always return undefined for this test (simulating cache miss)
      mockRegistry.getModel.mockReturnValue(undefined);

      const { result } = renderHook(() =>
        useMonacoModel("editor-1", "/test/file.ts", "/test"),
      );

      // Initially null while async loading
      expect(result.current).toBe(null);

      // Wait for async load to be triggered
      await waitFor(() => {
        expect(mockRegistry.getOrCreateModel).toHaveBeenCalledWith(
          "/test/file.ts",
          "/test",
          undefined,
        );
      });
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
          createModelKey("/test/file.ts", undefined),
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
        createModelKey("/test/file.ts", undefined),
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
    it("should release reference when file path changes", async () => {
      const { rerender } = renderHook(
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

      const firstModelKey = createModelKey("/test/file1.ts", undefined);

      // Change to a different file
      await act(async () => {
        rerender({
          editorId: "editor-1",
          filePath: "/test/file2.ts",
          cwd: "/test",
        });
      });

      // Verify the effect ran and released reference from old file
      await waitFor(() => {
        expect(mockRegistry.removeReference).toHaveBeenCalledWith(
          firstModelKey,
          "editor-1",
        );
      });
    });

    it("should release reference when file path becomes null", async () => {
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

      // Model is available immediately (cached)
      expect(result.current).toBe(mockModel);

      // Change to null
      await act(async () => {
        rerender({ editorId: "editor-1", filePath: null, cwd: "/test" });
      });

      // Model should be null for null filePath
      expect(result.current).toBe(null);

      // Verify reference was released
      await waitFor(() => {
        expect(mockRegistry.removeReference).toHaveBeenCalledWith(
          createModelKey("/test/file.ts", undefined),
          "editor-1",
        );
      });
    });

    it("should add reference when file path changes from null", async () => {
      const { rerender } = renderHook(
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

      // No references added for null filePath
      expect(mockRegistry.addReference).not.toHaveBeenCalled();

      // Change to a file (model is cached)
      await act(async () => {
        rerender({
          editorId: "editor-1",
          filePath: "/test/file.ts",
          cwd: "/test",
        });
      });

      // Verify reference was added for new file
      await waitFor(() => {
        expect(mockRegistry.addReference).toHaveBeenCalledWith(
          createModelKey("/test/file.ts", undefined),
          "editor-1",
        );
      });
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should return null when model creation fails", async () => {
      // Make getModel return undefined (cache miss) to trigger async load
      mockRegistry.getModel.mockReturnValue(undefined);
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
        createModelKey("/test/file.ts", undefined),
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
