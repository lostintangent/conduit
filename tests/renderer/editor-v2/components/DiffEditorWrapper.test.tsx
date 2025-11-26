// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DiffEditorWrapper } from "../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/DiffEditorWrapper";

// ============================================================================
// Mocks
// ============================================================================

// Mock Monaco model
const mockModifiedModel = {
  getValue: vi.fn(() => "modified content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  uri: { toString: () => "file:///test/file.ts" },
  onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
};

// Mock Monaco diff editor
const mockDiffEditor = {
  setModel: vi.fn(),
  getModifiedEditor: vi.fn(() => ({
    focus: vi.fn(),
    getModel: vi.fn(() => mockModifiedModel),
  })),
  updateOptions: vi.fn(),
  dispose: vi.fn(),
};

// Mock monaco.editor.createDiffEditor
const mockCreateDiffEditor = vi.fn(() => mockDiffEditor);
const mockCreateModel = vi.fn(() => ({
  dispose: vi.fn(),
}));

// Mock monaco module
vi.mock("monaco-editor", () => ({
  editor: {
    createDiffEditor: (...args: unknown[]) => mockCreateDiffEditor(...args),
    createModel: (...args: unknown[]) => mockCreateModel(...args),
    setTheme: vi.fn(),
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ toString: () => uri })),
  },
}));

// Diff content state
let mockDiffContentState = {
  original: "original content",
  modified: "modified content",
  isLoading: false,
  error: null as string | null,
};

// Mock useDiffContent hook
vi.mock(
  "../../../../src/renderer/components/panes/editor-v2/hooks",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../src/renderer/components/panes/editor-v2/hooks")
      >();
    return {
      ...original,
      useDiffContent: vi.fn(() => mockDiffContentState),
      useMonacoModel: vi.fn(() => mockModifiedModel),
    };
  },
);

// ============================================================================
// Tests
// ============================================================================

describe("DiffEditorWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default state
    mockDiffContentState = {
      original: "original content",
      modified: "modified content",
      isLoading: false,
      error: null,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Loading State
  // ===========================================================================

  describe("loading state", () => {
    it("should show loading state while fetching content", () => {
      mockDiffContentState = {
        original: null as unknown as string,
        modified: null as unknown as string,
        isLoading: true,
        error: null,
      };

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      expect(screen.getByTestId("diff-editor-loading")).toBeDefined();
      expect(screen.getByText("Loading diff...")).toBeDefined();
    });

    it("should not create diff editor while loading", () => {
      mockDiffContentState = {
        original: null as unknown as string,
        modified: null as unknown as string,
        isLoading: true,
        error: null,
      };

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      // Editor container should not be rendered
      expect(screen.queryByTestId("diff-editor-wrapper")).toBeNull();
    });
  });

  // ===========================================================================
  // Error State
  // ===========================================================================

  describe("error state", () => {
    it("should show error state when fetch fails", () => {
      mockDiffContentState = {
        original: null as unknown as string,
        modified: null as unknown as string,
        isLoading: false,
        error: "Failed to fetch git content",
      };

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      expect(screen.getByTestId("diff-editor-error")).toBeDefined();
      expect(screen.getByText("Failed to fetch git content")).toBeDefined();
    });

    it("should not create diff editor on error", () => {
      mockDiffContentState = {
        original: null as unknown as string,
        modified: null as unknown as string,
        isLoading: false,
        error: "Failed to fetch git content",
      };

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      expect(screen.queryByTestId("diff-editor-wrapper")).toBeNull();
    });
  });

  // ===========================================================================
  // Diff Editor Creation
  // ===========================================================================

  describe("diff editor creation", () => {
    it("should render editor container when content is loaded", () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      expect(screen.getByTestId("diff-editor-wrapper")).toBeDefined();
    });

    it("should have full width and height classes", () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      const container = screen.getByTestId("diff-editor-wrapper");
      expect(container.className).toContain("h-full");
      expect(container.className).toContain("w-full");
    });

    it("should create diff editor with correct options", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-dark"
          readOnly={false}
        />,
      );

      await waitFor(() => {
        expect(mockCreateDiffEditor).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            theme: "vs-dark",
            readOnly: false,
            renderSideBySide: true,
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Model Setup
  // ===========================================================================

  describe("model setup", () => {
    it("should create original model from git content", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          "original content",
          expect.any(String),
          expect.anything(),
        );
      });
    });

    it("should set models on diff editor", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockDiffEditor.setModel).toHaveBeenCalledWith({
          original: expect.anything(),
          modified: mockModifiedModel,
        });
      });
    });
  });

  // ===========================================================================
  // Options Updates
  // ===========================================================================

  describe("options updates", () => {
    it("should update theme globally when theme changes", async () => {
      // Import the mocked monaco module to access setTheme
      const monaco = await import("monaco-editor");

      const { rerender } = render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-dark"
        />,
      );

      await waitFor(() => {
        expect(mockDiffEditor.setModel).toHaveBeenCalled();
      });

      // Clear the mock to check for the new call
      (monaco.editor.setTheme as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-light"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.setTheme).toHaveBeenCalledWith("vs-light");
      });
    });

    it("should update diff editor options when readOnly changes", async () => {
      const { rerender } = render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          readOnly={false}
        />,
      );

      await waitFor(() => {
        expect(mockDiffEditor.setModel).toHaveBeenCalled();
      });

      rerender(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          readOnly={true}
        />,
      );

      await waitFor(() => {
        expect(mockDiffEditor.updateOptions).toHaveBeenCalledWith(
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
    it("should focus modified editor when container is clicked", async () => {
      const mockFocus = vi.fn();
      mockDiffEditor.getModifiedEditor.mockReturnValue({
        focus: mockFocus,
        getModel: vi.fn(() => mockModifiedModel),
      });

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockDiffEditor.setModel).toHaveBeenCalled();
      });

      const container = screen.getByTestId("diff-editor-wrapper");
      fireEvent.click(container);

      expect(mockFocus).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Callbacks
  // ===========================================================================

  describe("callbacks", () => {
    it("should call onMount when diff editor is ready", async () => {
      const mockOnMount = vi.fn();

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          onMount={mockOnMount}
        />,
      );

      await waitFor(() => {
        expect(mockOnMount).toHaveBeenCalledWith(mockDiffEditor);
      });
    });

    it("should set up onChange listener when onChange is provided", async () => {
      const mockOnChange = vi.fn();

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          onChange={mockOnChange}
        />,
      );

      await waitFor(() => {
        expect(mockModifiedModel.onDidChangeContent).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Default Props
  // ===========================================================================

  describe("default props", () => {
    it("should use vs-dark theme by default", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockCreateDiffEditor).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            theme: "vs-dark",
          }),
        );
      });
    });

    it("should not be read-only by default", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockCreateDiffEditor).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            readOnly: false,
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("cleanup", () => {
    it("should dispose diff editor on unmount", async () => {
      const { unmount } = render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockDiffEditor.setModel).toHaveBeenCalled();
      });

      unmount();

      expect(mockDiffEditor.dispose).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Language Detection
  // ===========================================================================

  describe("language detection", () => {
    it("should detect typescript for .ts files", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          expect.any(String),
          "typescript",
          expect.anything(),
        );
      });
    });

    it("should detect javascript for .js files", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.js"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          expect.any(String),
          "javascript",
          expect.anything(),
        );
      });
    });

    it("should detect json for .json files", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.json"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          expect.any(String),
          "json",
          expect.anything(),
        );
      });
    });

    it("should default to plaintext for unknown extensions", async () => {
      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.xyz"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          expect.any(String),
          "plaintext",
          expect.anything(),
        );
      });
    });
  });
});
