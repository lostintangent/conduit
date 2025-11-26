import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useModelState } from "../../../../src/renderer/components/panes/editor-v2/hooks/useModelState";
import { pathToUri } from "../../../../src/renderer/components/panes/editor-v2/registry";
import type { ModelStateEvent } from "../../../../src/renderer/components/panes/editor-v2/types";

// ============================================================================
// Mocks
// ============================================================================

const mockRegistry = {
  getModelState: vi.fn((_uri?: string) => ({
    isDirty: false,
    isOrphaned: false,
    hasExternalChanges: false,
  })),
  onModelStateChanged: vi.fn((listener: (event: ModelStateEvent) => void) => {
    return { dispose: vi.fn() };
  }),
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

// Helper to get the registered listener from the mock
function getListener(): ((event: ModelStateEvent) => void) | undefined {
  const calls = mockRegistry.onModelStateChanged.mock.calls;
  if (calls.length > 0) {
    return calls[calls.length - 1][0];
  }
  return undefined;
}

// Helper to fire an event through the mock listener
function fireEvent(event: ModelStateEvent) {
  const listener = getListener();
  if (listener) {
    listener(event);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("useModelState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry.getModelState.mockReturnValue({
      isDirty: false,
      isOrphaned: false,
      hasExternalChanges: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should return null for null file path", () => {
      const { result } = renderHook(() => useModelState(null));

      expect(result.current).toBe(null);
      expect(mockRegistry.getModelState).not.toHaveBeenCalled();
    });

    it("should return initial state from registry", () => {
      mockRegistry.getModelState.mockReturnValue({
        isDirty: true,
        isOrphaned: false,
        hasExternalChanges: false,
      });

      const { result } = renderHook(() => useModelState("/test/file.ts"));

      expect(result.current).toEqual({
        isDirty: true,
        isOrphaned: false,
        hasExternalChanges: false,
      });
    });

    it("should return null if model does not exist", () => {
      mockRegistry.getModelState.mockReturnValue(null);

      const { result } = renderHook(() => useModelState("/test/file.ts"));

      expect(result.current).toBe(null);
    });
  });

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  describe("event subscription", () => {
    it("should subscribe to state changes on mount", () => {
      renderHook(() => useModelState("/test/file.ts"));

      expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
    });

    it("should unsubscribe on unmount", () => {
      const disposeMock = vi.fn();
      mockRegistry.onModelStateChanged.mockReturnValue({
        dispose: disposeMock,
      });

      const { unmount } = renderHook(() => useModelState("/test/file.ts"));

      unmount();

      expect(disposeMock).toHaveBeenCalled();
    });

    it("should not subscribe for null file path", () => {
      renderHook(() => useModelState(null));

      expect(mockRegistry.onModelStateChanged).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Dirty State Updates
  // ===========================================================================

  describe("dirty state updates", () => {
    it("should update on dirty event", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      expect(result.current?.isDirty).toBe(false);

      // Trigger dirty event
      act(() => {
        fireEvent({
          type: "dirty",
          uri: pathToUri("/test/file.ts"),
          isDirty: true,
        });
      });

      expect(result.current?.isDirty).toBe(true);
    });

    it("should ignore dirty events for other files", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      expect(result.current?.isDirty).toBe(false);

      // Trigger dirty event for different file
      act(() => {
        fireEvent({
          type: "dirty",
          uri: pathToUri("/test/other-file.ts"),
          isDirty: true,
        });
      });

      // Should still be false
      expect(result.current?.isDirty).toBe(false);
    });
  });

  // ===========================================================================
  // Orphaned State Updates
  // ===========================================================================

  describe("orphaned state updates", () => {
    it("should update on orphaned event", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      expect(result.current?.isOrphaned).toBe(false);

      // Trigger orphaned event
      act(() => {
        fireEvent({
          type: "orphaned",
          uri: pathToUri("/test/file.ts"),
          isOrphaned: true,
        });
      });

      expect(result.current?.isOrphaned).toBe(true);
    });
  });

  // ===========================================================================
  // External Change Updates
  // ===========================================================================

  describe("external change updates", () => {
    it("should update on external change event with conflict", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      expect(result.current?.hasExternalChanges).toBe(false);

      // Trigger external change event with conflict
      act(() => {
        fireEvent({
          type: "externalChange",
          uri: pathToUri("/test/file.ts"),
          hasConflict: true,
        });
      });

      expect(result.current?.hasExternalChanges).toBe(true);
    });

    it("should not set hasExternalChanges on external change without conflict", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      // Trigger external change event without conflict (auto-reload)
      act(() => {
        fireEvent({
          type: "externalChange",
          uri: pathToUri("/test/file.ts"),
          hasConflict: false,
        });
      });

      expect(result.current?.hasExternalChanges).toBe(false);
    });
  });

  // ===========================================================================
  // Save and Reload Events
  // ===========================================================================

  describe("save and reload events", () => {
    it("should clear dirty and external changes on save", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      // First make it dirty and have external changes
      act(() => {
        fireEvent({
          type: "dirty",
          uri: pathToUri("/test/file.ts"),
          isDirty: true,
        });
        fireEvent({
          type: "externalChange",
          uri: pathToUri("/test/file.ts"),
          hasConflict: true,
        });
      });

      expect(result.current?.isDirty).toBe(true);
      expect(result.current?.hasExternalChanges).toBe(true);

      // Trigger saved event
      act(() => {
        fireEvent({
          type: "saved",
          uri: pathToUri("/test/file.ts"),
        });
      });

      expect(result.current?.isDirty).toBe(false);
      expect(result.current?.hasExternalChanges).toBe(false);
    });

    it("should clear external changes on reload", async () => {
      const { result } = renderHook(() => useModelState("/test/file.ts"));

      // Wait for listener to be registered
      await waitFor(() => {
        expect(mockRegistry.onModelStateChanged).toHaveBeenCalled();
      });

      // First set external changes
      act(() => {
        fireEvent({
          type: "externalChange",
          uri: pathToUri("/test/file.ts"),
          hasConflict: true,
        });
      });

      expect(result.current?.hasExternalChanges).toBe(true);

      // Trigger reloaded event
      act(() => {
        fireEvent({
          type: "reloaded",
          uri: pathToUri("/test/file.ts"),
        });
      });

      expect(result.current?.hasExternalChanges).toBe(false);
    });
  });

  // ===========================================================================
  // File Path Changes
  // ===========================================================================

  describe("file path changes", () => {
    it("should reset state when file path changes to null", () => {
      const { result, rerender } = renderHook(
        ({ filePath }) => useModelState(filePath),
        { initialProps: { filePath: "/test/file.ts" as string | null } },
      );

      expect(result.current).not.toBe(null);

      // Change to null
      rerender({ filePath: null });

      expect(result.current).toBe(null);
    });

    it("should get new state when file path changes", () => {
      // Return different states for different file paths
      mockRegistry.getModelState.mockImplementation((uri: string) => {
        if (uri === pathToUri("/test/file1.ts")) {
          return {
            isDirty: true,
            isOrphaned: false,
            hasExternalChanges: false,
          };
        } else if (uri === pathToUri("/test/file2.ts")) {
          return {
            isDirty: false,
            isOrphaned: true,
            hasExternalChanges: false,
          };
        }
        return null;
      });

      const { result, rerender } = renderHook(
        ({ filePath }) => useModelState(filePath),
        { initialProps: { filePath: "/test/file1.ts" } },
      );

      expect(result.current?.isDirty).toBe(true);

      // Change file path
      rerender({ filePath: "/test/file2.ts" });

      expect(result.current?.isOrphaned).toBe(true);
      expect(result.current?.isDirty).toBe(false);
    });
  });
});
