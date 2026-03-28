/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorSaveKeybinding } from "../../../../src/renderer/components/panes/editor/hooks/useEditorSaveKeybinding";

// ============================================================================
// Mocks
// ============================================================================

// Mock monaco-editor
vi.mock("monaco-editor", () => ({
  KeyMod: {
    CtrlCmd: 2048,
  },
  KeyCode: {
    KeyS: 49,
  },
}));

/**
 * Creates a mock Monaco editor.
 */
function createMockEditor() {
  const disposeMock = vi.fn();
  const addActionMock = vi.fn().mockReturnValue({ dispose: disposeMock });

  return {
    addAction: addActionMock,
    _disposeMock: disposeMock,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("useEditorSaveKeybinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("basic functionality", () => {
    it("should return registerSaveKeybinding function", () => {
      const onSave = vi.fn();
      const { result } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      expect(result.current.registerSaveKeybinding).toBeDefined();
      expect(typeof result.current.registerSaveKeybinding).toBe("function");
    });

    it("should register keybinding on editor when called", () => {
      const onSave = vi.fn();
      const mockEditor = createMockEditor();

      const { result } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      act(() => {
        result.current.registerSaveKeybinding(mockEditor as any);
      });

      expect(mockEditor.addAction).toHaveBeenCalledWith({
        id: "conduit.save.test-editor",
        label: "Save",
        keybindings: [2048 | 49], // CtrlCmd | KeyS
        run: expect.any(Function),
      });
    });

    it("should call onSave when keybinding is triggered", () => {
      const onSave = vi.fn();
      const mockEditor = createMockEditor();

      const { result } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      act(() => {
        result.current.registerSaveKeybinding(mockEditor as any);
      });

      // Get the run function and call it
      const actionConfig = mockEditor.addAction.mock.calls[0][0];
      actionConfig.run();

      expect(onSave).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Unique Editor IDs
  // ===========================================================================

  describe("unique editor IDs", () => {
    it("should use editorId in action ID", () => {
      const onSave = vi.fn();
      const mockEditor = createMockEditor();

      const { result } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "my-unique-editor"),
      );

      act(() => {
        result.current.registerSaveKeybinding(mockEditor as any);
      });

      expect(mockEditor.addAction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "conduit.save.my-unique-editor",
        }),
      );
    });

    it("should create different action IDs for different editors", () => {
      const mockEditor1 = createMockEditor();
      const mockEditor2 = createMockEditor();

      const { result: result1 } = renderHook(() =>
        useEditorSaveKeybinding(vi.fn(), "editor-1"),
      );
      const { result: result2 } = renderHook(() =>
        useEditorSaveKeybinding(vi.fn(), "editor-2"),
      );

      act(() => {
        result1.current.registerSaveKeybinding(mockEditor1 as any);
        result2.current.registerSaveKeybinding(mockEditor2 as any);
      });

      const id1 = mockEditor1.addAction.mock.calls[0][0].id;
      const id2 = mockEditor2.addAction.mock.calls[0][0].id;

      expect(id1).toBe("conduit.save.editor-1");
      expect(id2).toBe("conduit.save.editor-2");
      expect(id1).not.toBe(id2);
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("cleanup", () => {
    it("should dispose previous keybinding when registering new one", () => {
      const onSave = vi.fn();
      const mockEditor1 = createMockEditor();
      const mockEditor2 = createMockEditor();

      const { result } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      // Register first keybinding
      act(() => {
        result.current.registerSaveKeybinding(mockEditor1 as any);
      });

      // Register second keybinding (should dispose first)
      act(() => {
        result.current.registerSaveKeybinding(mockEditor2 as any);
      });

      expect(mockEditor1._disposeMock).toHaveBeenCalled();
    });

    it("should dispose keybinding on unmount", () => {
      const onSave = vi.fn();
      const mockEditor = createMockEditor();

      const { result, unmount } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      act(() => {
        result.current.registerSaveKeybinding(mockEditor as any);
      });

      unmount();

      expect(mockEditor._disposeMock).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Callback Updates
  // ===========================================================================

  describe("callback updates", () => {
    it("should use latest onSave callback (avoids stale closure)", () => {
      const onSave1 = vi.fn();
      const onSave2 = vi.fn();
      const mockEditor = createMockEditor();

      const { result, rerender } = renderHook(
        ({ onSave }) => useEditorSaveKeybinding(onSave, "test-editor"),
        { initialProps: { onSave: onSave1 } },
      );

      // Register keybinding with first callback
      act(() => {
        result.current.registerSaveKeybinding(mockEditor as any);
      });

      // Update callback
      rerender({ onSave: onSave2 });

      // Trigger the keybinding
      const actionConfig = mockEditor.addAction.mock.calls[0][0];
      actionConfig.run();

      // Should call the updated callback, not the original
      expect(onSave1).not.toHaveBeenCalled();
      expect(onSave2).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle multiple register calls on same editor", () => {
      const onSave = vi.fn();
      const mockEditor = createMockEditor();

      const { result } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      // Register multiple times on same editor
      act(() => {
        result.current.registerSaveKeybinding(mockEditor as any);
        result.current.registerSaveKeybinding(mockEditor as any);
        result.current.registerSaveKeybinding(mockEditor as any);
      });

      // Should have been called 3 times (once per register)
      expect(mockEditor.addAction).toHaveBeenCalledTimes(3);
      // Previous ones should have been disposed
      expect(mockEditor._disposeMock).toHaveBeenCalledTimes(2);
    });

    it("should not throw if unmounted without registering", () => {
      const onSave = vi.fn();

      const { unmount } = renderHook(() =>
        useEditorSaveKeybinding(onSave, "test-editor"),
      );

      expect(() => unmount()).not.toThrow();
    });
  });
});
