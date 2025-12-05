// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ============================================================================
// Mocks - Must be defined before vi.mock calls that reference them
// ============================================================================

// Mock Monaco model
const mockModel = {
  getValue: vi.fn(() => "file content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  uri: { toString: () => "file:///test/file.ts" },
  onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
};

// Mock Monaco editor - returned by monaco.editor.create
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
  onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
  onDidFocusEditorText: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
  onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  getDomNode: vi.fn(() => document.createElement("div")),
  layout: vi.fn(),
};

// Mock ViewStateRegistry
const mockViewStateRegistry = {
  save: vi.fn(),
  restore: vi.fn(),
};

// Mock useMonacoModel hook
// Note: We don't use importOriginal because the real hooks would access window.conduit
vi.mock("../../../../../src/renderer/components/panes/editor-v2/hooks", () => ({
  useMonacoModel: vi.fn(() => mockModel),
  useResponsiveLayout: vi.fn(() => ({ layoutMode: "normal", showTree: true })),
  useEditorVisibility: vi.fn(),
  useDiffContent: vi.fn(() => ({
    original: "original",
    modified: "modified",
    isLoading: false,
    error: null,
  })),
  useModelState: vi.fn(() => ({
    content: "content",
    isDirty: false,
    isOrphaned: false,
  })),
}));

// Mock monaco-editor - The component uses monaco.editor.create directly
vi.mock("monaco-editor", () => ({
  editor: {
    create: vi.fn(() => mockEditor),
    createModel: vi.fn(() => mockModel),
    setTheme: vi.fn(),
    defineTheme: vi.fn(),
    setModelLanguage: vi.fn(),
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ toString: () => uri })),
    file: vi.fn((path: string) => ({
      toString: () => `file://${path}`,
      fsPath: path,
    })),
  },
}));

// Mock registries
vi.mock(
  "../../../../../src/renderer/components/panes/editor-v2/registry",
  () => ({
    EditorRegistry: {
      getInstance: () => ({
        getOrCreateEditor: vi.fn(() => mockEditor),
        releaseEditor: vi.fn(),
      }),
      resetInstance: vi.fn(),
    },
    ViewStateRegistry: {
      getInstance: () => mockViewStateRegistry,
      resetInstance: vi.fn(),
    },
    MonacoModelRegistry: {
      getInstance: () => ({
        getOrCreate: vi.fn(() => mockModel),
        release: vi.fn(),
      }),
      resetInstance: vi.fn(),
    },
    EditorPaneRegistry: {
      getInstance: () => ({
        getOrCreate: vi.fn(),
        dispose: vi.fn(),
        disposeAll: vi.fn(),
        attach: vi.fn(),
        detach: vi.fn(),
      }),
      resetInstance: vi.fn(),
    },
  }),
);

// Import after mocks are set up
import { RegularEditorWrapper } from "../../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/RegularEditorWrapper";
import * as monaco from "monaco-editor";

// ============================================================================
// Tests
// ============================================================================

describe("RegularEditorWrapper", () => {
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
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      expect(screen.getByTestId("monaco-editor-wrapper")).toBeDefined();
    });

    it("should have full width and height classes", () => {
      render(
        <RegularEditorWrapper
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
  // Editor Creation
  // ===========================================================================

  describe("editor creation", () => {
    it("should create editor using monaco.editor.create on mount", async () => {
      render(
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-dark"
          readOnly={false}
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            theme: "vs-dark",
            readOnly: false,
          }),
        );
      });
    });

    it("should dispose editor on unmount", async () => {
      const { unmount } = render(
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalled();
      });

      unmount();

      expect(mockEditor.dispose).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Model Attachment
  // ===========================================================================

  describe("model attachment", () => {
    it("should attach model to editor", async () => {
      render(
        <RegularEditorWrapper
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
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalledWith(
          "test-editor",
          "/test/file.ts",
          expect.any(Object),
        );
      });
    });

    it("should save viewstate on unmount", async () => {
      const { unmount } = render(
        <RegularEditorWrapper
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
        expect.any(Object),
      );
    });
  });

  // ===========================================================================
  // Options Updates
  // ===========================================================================

  describe("options updates", () => {
    it("should update editor options when theme changes", async () => {
      const { rerender } = render(
        <RegularEditorWrapper
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
        <RegularEditorWrapper
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
        <RegularEditorWrapper
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
        <RegularEditorWrapper
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
        <RegularEditorWrapper
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
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
          onMount={mockOnMount}
        />,
      );

      await waitFor(() => {
        expect(mockOnMount).toHaveBeenCalledWith(expect.any(Object));
      });
    });

    it("should set up onChange listener when onChange is provided", async () => {
      const mockOnChange = vi.fn();

      render(
        <RegularEditorWrapper
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
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            theme: "vs-dark",
          }),
        );
      });
    });

    it("should not be read-only by default", async () => {
      render(
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalledWith(
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
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file1.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalledWith(
          "test-editor",
          "/test/file1.ts",
          expect.any(Object),
        );
      });

      // Clear mocks before rerender
      mockViewStateRegistry.save.mockClear();
      mockViewStateRegistry.restore.mockClear();

      rerender(
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file2.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.save).toHaveBeenCalledWith(
          "test-editor",
          "/test/file1.ts",
          expect.any(Object),
        );
      });
    });

    it("should restore viewstate for new file after switching", async () => {
      const { rerender } = render(
        <RegularEditorWrapper
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
        <RegularEditorWrapper
          editorId="test-editor"
          cwd="/test"
          filePath="/test/file2.ts"
        />,
      );

      await waitFor(() => {
        expect(mockViewStateRegistry.restore).toHaveBeenCalledWith(
          "test-editor",
          "/test/file2.ts",
          expect.any(Object),
        );
      });
    });
  });
});
