// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MonacoEditorWrapper } from "../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/MonacoEditorWrapper";

// ============================================================================
// Mocks
// ============================================================================

// Mock Monaco model
const mockModel = {
  getValue: vi.fn(() => "file content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  uri: { toString: () => "file:///test/file.ts" },
  onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
};

// Mock Monaco editor
const mockEditor = {
  setModel: vi.fn(),
  getModel: vi.fn(() => mockModel),
  updateOptions: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
  saveViewState: vi.fn(() => ({
    cursorState: [{ position: { lineNumber: 1, column: 1 } }],
    viewState: { scrollTop: 0 },
  })),
  restoreViewState: vi.fn(),
  onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
};

// Mock EditorRegistry
const mockEditorRegistry = {
  getOrCreateEditor: vi.fn(() => mockEditor),
  releaseEditor: vi.fn(),
};

// Mock ViewStateRegistry
const mockViewStateRegistry = {
  save: vi.fn(),
  restore: vi.fn(),
};

// Mock useMonacoModel hook
vi.mock(
  "../../../../src/renderer/components/panes/editor-v2/hooks",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../src/renderer/components/panes/editor-v2/hooks")
      >();
    return {
      ...original,
      useMonacoModel: vi.fn(() => mockModel),
    };
  },
);

// Mock registries
vi.mock(
  "../../../../src/renderer/components/panes/editor-v2/registry",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../src/renderer/components/panes/editor-v2/registry")
      >();
    return {
      ...original,
      EditorRegistry: {
        getInstance: () => mockEditorRegistry,
        resetInstance: vi.fn(),
      },
      ViewStateRegistry: {
        getInstance: () => mockViewStateRegistry,
        resetInstance: vi.fn(),
      },
    };
  },
);

// ============================================================================
// Tests
// ============================================================================

describe("MonacoEditorWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Rendering
  // ===========================================================================

  describe("rendering", () => {
    it("should render the editor container", () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      expect(screen.getByTestId("monaco-editor-wrapper")).toBeDefined();
    });

    it("should have full width and height classes", () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      const container = screen.getByTestId("monaco-editor-wrapper");
      expect(container.className).toContain("h-full");
      expect(container.className).toContain("w-full");
    });
  });

  // ===========================================================================
  // Editor Registry Integration
  // ===========================================================================

  describe("editor registry integration", () => {
    it("should get or create editor from registry on mount", async () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-dark"
          readOnly={false}
        />,
      );

      await waitFor(() => {
        expect(mockEditorRegistry.getOrCreateEditor).toHaveBeenCalledWith(
          "test-editor",
          expect.any(HTMLElement),
          expect.objectContaining({
            theme: "vs-dark",
            readOnly: false,
          }),
        );
      });
    });

    it("should release editor on unmount", async () => {
      const { unmount } = render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockEditorRegistry.getOrCreateEditor).toHaveBeenCalled();
      });

      unmount();

      expect(mockEditorRegistry.releaseEditor).toHaveBeenCalledWith(
        "test-editor",
      );
    });
  });

  // ===========================================================================
  // Model Attachment
  // ===========================================================================

  describe("model attachment", () => {
    it("should attach model to editor", async () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockEditor.setModel).toHaveBeenCalledWith(mockModel);
      });
    });
  });

  // ===========================================================================
  // ViewState Management
  // ===========================================================================

  describe("viewstate management", () => {
    it("should restore viewstate for file", async () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalledWith(
          "test-editor",
          "/test/file.ts",
          mockEditor,
        );
      });
    });

    it("should save viewstate on unmount", async () => {
      const { unmount } = render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockEditor.setModel).toHaveBeenCalled();
      });

      unmount();

      expect(mockViewStateRegistry.save).toHaveBeenCalledWith(
        "test-editor",
        "/test/file.ts",
        mockEditor,
      );
    });
  });

  // ===========================================================================
  // Options Updates
  // ===========================================================================

  describe("options updates", () => {
    it("should update editor options when theme changes", async () => {
      const { rerender } = render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-dark"
        />,
      );

      await waitFor(() => {
        expect(mockEditor.setModel).toHaveBeenCalled();
      });

      rerender(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-light"
        />,
      );

      await waitFor(() => {
        expect(mockEditor.updateOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            theme: "vs-light",
          }),
        );
      });
    });

    it("should update editor options when readOnly changes", async () => {
      const { rerender } = render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          readOnly={false}
        />,
      );

      await waitFor(() => {
        expect(mockEditor.setModel).toHaveBeenCalled();
      });

      rerender(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          readOnly={true}
        />,
      );

      await waitFor(() => {
        expect(mockEditor.updateOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            readOnly: true,
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Focus Handling
  // ===========================================================================

  describe("focus handling", () => {
    it("should focus editor when container is clicked", async () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockEditor.setModel).toHaveBeenCalled();
      });

      const container = screen.getByTestId("monaco-editor-wrapper");
      fireEvent.click(container);

      expect(mockEditor.focus).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Callbacks
  // ===========================================================================

  describe("callbacks", () => {
    it("should call onMount when editor is ready", async () => {
      const mockOnMount = vi.fn();

      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          onMount={mockOnMount}
        />,
      );

      await waitFor(() => {
        expect(mockOnMount).toHaveBeenCalledWith(mockEditor);
      });
    });

    it("should set up onChange listener when onChange is provided", async () => {
      const mockOnChange = vi.fn();

      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          onChange={mockOnChange}
        />,
      );

      await waitFor(() => {
        expect(mockModel.onDidChangeContent).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Default Props
  // ===========================================================================

  describe("default props", () => {
    it("should use vs-dark theme by default", async () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockEditorRegistry.getOrCreateEditor).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(HTMLElement),
          expect.objectContaining({
            theme: "vs-dark",
          }),
        );
      });
    });

    it("should not be read-only by default", async () => {
      render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockEditorRegistry.getOrCreateEditor).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(HTMLElement),
          expect.objectContaining({
            readOnly: false,
          }),
        );
      });
    });
  });

  // ===========================================================================
  // File Path Changes
  // ===========================================================================

  describe("file path changes", () => {
    it("should save viewstate for old file when switching files", async () => {
      const { rerender } = render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file1.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalledWith(
          "test-editor",
          "/test/file1.ts",
          mockEditor,
        );
      });

      // Clear mocks before rerender
      mockViewStateRegistry.save.mockClear();
      mockViewStateRegistry.restore.mockClear();

      rerender(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file2.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.save).toHaveBeenCalledWith(
          "test-editor",
          "/test/file1.ts",
          mockEditor,
        );
      });
    });

    it("should restore viewstate for new file after switching", async () => {
      const { rerender } = render(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file1.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalled();
      });

      mockViewStateRegistry.restore.mockClear();

      rerender(
        <MonacoEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file2.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalledWith(
          "test-editor",
          "/test/file2.ts",
          mockEditor,
        );
      });
    });
  });
});
