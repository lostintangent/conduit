/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSizeEditor } from "../../../../src/renderer/components/panes/editor-v2/hooks/useAutoSizeEditor";
import type { AutoSizeConfig } from "../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/constants";

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock Monaco editor with configurable content height.
 */
function createMockEditor(contentHeight = 200) {
  const listeners: Array<() => void> = [];

  return {
    getContentHeight: vi.fn(() => contentHeight),
    onDidContentSizeChange: vi.fn((callback: () => void) => {
      listeners.push(callback);
      return {
        dispose: vi.fn(() => {
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
        }),
      };
    }),
    // Helper to simulate content size change
    _triggerContentSizeChange: () => {
      listeners.forEach((cb) => cb());
    },
    _setContentHeight: (height: number) => {
      (createMockEditor as any)._currentHeight = height;
    },
  };
}

/**
 * Creates a mock Monaco diff editor with configurable content heights.
 */
function createMockDiffEditor(originalHeight = 150, modifiedHeight = 200) {
  const originalListeners: Array<() => void> = [];
  const modifiedListeners: Array<() => void> = [];

  const mockOriginalEditor = {
    getContentHeight: vi.fn(() => originalHeight),
    onDidContentSizeChange: vi.fn((callback: () => void) => {
      originalListeners.push(callback);
      return {
        dispose: vi.fn(() => {
          const index = originalListeners.indexOf(callback);
          if (index > -1) originalListeners.splice(index, 1);
        }),
      };
    }),
  };

  const mockModifiedEditor = {
    getContentHeight: vi.fn(() => modifiedHeight),
    onDidContentSizeChange: vi.fn((callback: () => void) => {
      modifiedListeners.push(callback);
      return {
        dispose: vi.fn(() => {
          const index = modifiedListeners.indexOf(callback);
          if (index > -1) modifiedListeners.splice(index, 1);
        }),
      };
    }),
  };

  return {
    getOriginalEditor: vi.fn(() => mockOriginalEditor),
    getModifiedEditor: vi.fn(() => mockModifiedEditor),
    // Helpers for testing
    _triggerOriginalSizeChange: () => {
      originalListeners.forEach((cb) => cb());
    },
    _triggerModifiedSizeChange: () => {
      modifiedListeners.forEach((cb) => cb());
    },
    _mockOriginalEditor: mockOriginalEditor,
    _mockModifiedEditor: mockModifiedEditor,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("useAutoSizeEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Disabled State (no config)
  // ===========================================================================

  describe("when config is not provided", () => {
    it("should return enabled: false", () => {
      const { result } = renderHook(() => useAutoSizeEditor({ editor: null }));

      expect(result.current.enabled).toBe(false);
    });

    it("should return container style for full height", () => {
      const { result } = renderHook(() => useAutoSizeEditor({ editor: null }));

      expect(result.current.containerStyle).toEqual({
        height: "100%",
        width: "100%",
      });
    });

    it("should return default height", () => {
      const { result } = renderHook(() => useAutoSizeEditor({ editor: null }));

      // Default minHeight when no config provided
      expect(result.current.height).toBe(100);
    });
  });

  // ===========================================================================
  // Enabled State (with config)
  // ===========================================================================

  describe("when config is provided", () => {
    const config: AutoSizeConfig = {
      minHeight: 100,
      maxHeight: 400,
    };

    it("should return enabled: true", () => {
      const mockEditor = createMockEditor(200);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      expect(result.current.enabled).toBe(true);
    });

    it("should return container style with computed height", () => {
      const mockEditor = createMockEditor(200);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      expect(result.current.containerStyle).toEqual({
        height: 200,
        width: "100%",
      });
    });
  });

  // ===========================================================================
  // Regular Editor
  // ===========================================================================

  describe("with regular editor", () => {
    const config: AutoSizeConfig = {
      minHeight: 100,
      maxHeight: 400,
    };

    it("should use editor content height", () => {
      const mockEditor = createMockEditor(250);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      expect(result.current.height).toBe(250);
    });

    it("should clamp to minHeight when content is smaller", () => {
      const mockEditor = createMockEditor(50);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      expect(result.current.height).toBe(100); // minHeight
    });

    it("should clamp to maxHeight when content is larger", () => {
      const mockEditor = createMockEditor(600);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      expect(result.current.height).toBe(400); // maxHeight
    });

    it("should set up content size change listener", () => {
      const mockEditor = createMockEditor(200);

      renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      expect(mockEditor.onDidContentSizeChange).toHaveBeenCalled();
    });

    it("should dispose listener on unmount", () => {
      const mockEditor = createMockEditor(200);
      const disposeFn = vi.fn();
      mockEditor.onDidContentSizeChange.mockReturnValue({ dispose: disposeFn });

      const { unmount } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
        }),
      );

      unmount();

      expect(disposeFn).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Diff Editor
  // ===========================================================================

  describe("with diff editor", () => {
    const config: AutoSizeConfig = {
      minHeight: 100,
      maxHeight: 400,
    };

    it("should use max of both editors content heights", () => {
      const mockDiffEditor = createMockDiffEditor(150, 250);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          diffEditor: mockDiffEditor as any,
          config,
        }),
      );

      expect(result.current.height).toBe(250); // max of 150 and 250
    });

    it("should use original height when it is larger", () => {
      const mockDiffEditor = createMockDiffEditor(300, 200);

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          diffEditor: mockDiffEditor as any,
          config,
        }),
      );

      expect(result.current.height).toBe(300);
    });

    it("should set up listeners on both editors", () => {
      const mockDiffEditor = createMockDiffEditor(150, 250);

      renderHook(() =>
        useAutoSizeEditor({
          diffEditor: mockDiffEditor as any,
          config,
        }),
      );

      expect(
        mockDiffEditor._mockOriginalEditor.onDidContentSizeChange,
      ).toHaveBeenCalled();
      expect(
        mockDiffEditor._mockModifiedEditor.onDidContentSizeChange,
      ).toHaveBeenCalled();
    });

    it("should dispose both listeners on unmount", () => {
      const mockDiffEditor = createMockDiffEditor(150, 250);
      const disposeOriginal = vi.fn();
      const disposeModified = vi.fn();

      mockDiffEditor._mockOriginalEditor.onDidContentSizeChange.mockReturnValue(
        { dispose: disposeOriginal },
      );
      mockDiffEditor._mockModifiedEditor.onDidContentSizeChange.mockReturnValue(
        { dispose: disposeModified },
      );

      const { unmount } = renderHook(() =>
        useAutoSizeEditor({
          diffEditor: mockDiffEditor as any,
          config,
        }),
      );

      unmount();

      expect(disposeOriginal).toHaveBeenCalled();
      expect(disposeModified).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    const config: AutoSizeConfig = {
      minHeight: 100,
      maxHeight: 400,
    };

    it("should handle null editor gracefully", () => {
      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: null,
          config,
        }),
      );

      // Should still be enabled but use default height
      expect(result.current.enabled).toBe(true);
      expect(result.current.height).toBe(100);
    });

    it("should handle null diffEditor gracefully", () => {
      const { result } = renderHook(() =>
        useAutoSizeEditor({
          diffEditor: null,
          config,
        }),
      );

      expect(result.current.enabled).toBe(true);
      expect(result.current.height).toBe(100);
    });

    it("should handle config with equal min and max", () => {
      const mockEditor = createMockEditor(300);
      const equalConfig: AutoSizeConfig = {
        minHeight: 200,
        maxHeight: 200,
      };

      const { result } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config: equalConfig,
        }),
      );

      expect(result.current.height).toBe(200);
    });

    it("should recalculate when deps change", () => {
      const mockEditor = createMockEditor(200);
      let dep = 1;

      const { result, rerender } = renderHook(() =>
        useAutoSizeEditor({
          editor: mockEditor as any,
          config,
          deps: [dep],
        }),
      );

      expect(result.current.height).toBe(200);

      // Change the mock return value and deps
      mockEditor.getContentHeight.mockReturnValue(350);
      dep = 2;

      rerender();

      expect(result.current.height).toBe(350);
    });
  });
});
