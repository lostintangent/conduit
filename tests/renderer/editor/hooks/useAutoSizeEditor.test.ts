/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoSizeEditor } from "../../../../src/renderer/components/panes/editor/hooks/useAutoSizeEditor";

/**
 * Creates a mock Monaco editor with configurable content height.
 */
function createMockEditor(contentHeight = 200) {
  return {
    getContentHeight: vi.fn(() => contentHeight),
    onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

/**
 * Creates a mock Monaco diff editor.
 */
function createMockDiffEditor(originalHeight = 150, modifiedHeight = 200) {
  const mockOriginal = {
    getContentHeight: vi.fn(() => originalHeight),
    onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
  };

  const mockModified = {
    getContentHeight: vi.fn(() => modifiedHeight),
    onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
  };

  return {
    getOriginalEditor: vi.fn(() => mockOriginal),
    getModifiedEditor: vi.fn(() => mockModified),
  };
}

describe("useAutoSizeEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when maxHeight is not provided", () => {
    it("should return enabled: false", () => {
      const { result } = renderHook(() => useAutoSizeEditor({}));
      expect(result.current.enabled).toBe(false);
    });

    it("should return a containerRef", () => {
      const { result } = renderHook(() => useAutoSizeEditor({}));
      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerRef.current).toBeNull();
    });
  });

  describe("when maxHeight is provided", () => {
    it("should return enabled: true", () => {
      const { result } = renderHook(() =>
        useAutoSizeEditor({ maxHeight: 800 }),
      );
      expect(result.current.enabled).toBe(true);
    });

    it("should return a containerRef", () => {
      const { result } = renderHook(() =>
        useAutoSizeEditor({ maxHeight: 800 }),
      );
      expect(result.current.containerRef).toBeDefined();
    });

    it("should set up content size change listener for regular editor", () => {
      const mockEditor = createMockEditor(300);

      renderHook(() =>
        useAutoSizeEditor({ editor: mockEditor as any, maxHeight: 800 }),
      );

      expect(mockEditor.onDidContentSizeChange).toHaveBeenCalled();
    });

    it("should set up content size change listeners for diff editor", () => {
      const mockDiffEditor = createMockDiffEditor(150, 400);

      renderHook(() =>
        useAutoSizeEditor({
          diffEditor: mockDiffEditor as any,
          maxHeight: 800,
        }),
      );

      expect(
        mockDiffEditor.getModifiedEditor().onDidContentSizeChange,
      ).toHaveBeenCalled();
      expect(
        mockDiffEditor.getOriginalEditor().onDidContentSizeChange,
      ).toHaveBeenCalled();
    });

    it("should dispose listener on unmount", () => {
      const disposeFn = vi.fn();
      const mockEditor = {
        getContentHeight: vi.fn(() => 200),
        onDidContentSizeChange: vi.fn(() => ({ dispose: disposeFn })),
      };

      const { unmount } = renderHook(() =>
        useAutoSizeEditor({ editor: mockEditor as any, maxHeight: 800 }),
      );

      unmount();
      expect(disposeFn).toHaveBeenCalled();
    });
  });
});
