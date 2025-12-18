// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks - Use vi.hoisted to create mocks that can be dynamically changed
// ============================================================================

// State container for dynamic mock state
const mockState = vi.hoisted(() => ({
  diffContent: {
    original: "original content",
    modified: "modified content",
    isLoading: false,
    error: null as string | null,
  },
}));

// Mock Monaco model - uses a dynamic filePath that can be updated per test
let mockModelFilePath = "/test/file.ts";

const mockModifiedModel = {
  getValue: vi.fn(() => "modified content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  uri: {
    toString: () => `file://${mockModelFilePath}`,
    fsPath: mockModelFilePath,
  },
  onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
};

// Helper to update mock model's file path for tests that use different files
const setMockModelFilePath = (filePath: string) => {
  mockModelFilePath = filePath;
  mockModifiedModel.uri.fsPath = filePath;
};

// Mock modified editor (returned by getModifiedEditor)
const mockModifiedEditor = {
  focus: vi.fn(),
  getModel: vi.fn(() => mockModifiedModel),
  saveViewState: vi.fn(() => ({
    cursorState: [{ position: { lineNumber: 1, column: 1 } }],
    viewState: { scrollTop: 0 },
  })),
  restoreViewState: vi.fn(),
};

// Mock Monaco diff editor
const mockDiffEditor = {
  setModel: vi.fn(),
  getModifiedEditor: vi.fn(() => mockModifiedEditor),
  updateOptions: vi.fn(),
  dispose: vi.fn(),
  layout: vi.fn(),
};

// Mock monaco.editor.createDiffEditor
const mockCreateDiffEditor = vi.fn(() => mockDiffEditor);
const mockCreateModel = vi.fn(() => ({
  dispose: vi.fn(),
}));
const mockSetTheme = vi.fn();

// Mock monaco module
vi.mock("monaco-editor", () => ({
  editor: {
    createDiffEditor: (...args: unknown[]) => mockCreateDiffEditor(...args),
    createModel: (...args: unknown[]) => mockCreateModel(...args),
    setTheme: (...args: unknown[]) => mockSetTheme(...args),
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ toString: () => uri })),
    file: vi.fn((path: string) => ({
      toString: () => `file://${path}`,
      fsPath: path,
    })),
  },
}));

// Mock ViewStateRegistry
const mockViewStateRegistry = {
  save: vi.fn(),
  restore: vi.fn(),
};

// Mock useDiffContent hook - return function that reads current state
vi.mock("../../../../../src/renderer/components/panes/editor-v2/hooks", () => ({
  useDiffContent: vi.fn(() => mockState.diffContent),
  useMonacoModel: vi.fn(() => mockModifiedModel),
  useResponsiveLayout: vi.fn(() => ({ layoutMode: "normal", showTree: true })),
  useEditorVisibility: vi.fn(),
  useModelState: vi.fn(() => ({
    content: "content",
    isDirty: false,
    isOrphaned: false,
  })),
  useEditorTheme: vi.fn(() => "vs-dark"),
  useAutoSizeEditor: vi.fn(() => ({
    height: 100,
    enabled: false,
    containerStyle: { height: "100%", width: "100%" },
  })),
  usePreventFocusScroll: vi.fn(),
}));

// Mock registries
vi.mock(
  "../../../../../src/renderer/components/panes/editor-v2/registry",
  () => ({
    ViewStateRegistry: {
      getInstance: () => mockViewStateRegistry,
      resetInstance: vi.fn(),
    },
    MonacoModelRegistry: {
      getInstance: () => ({
        getOrCreate: vi.fn(() => mockModifiedModel),
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
    EditorRegistry: {
      getInstance: () => ({
        getOrCreateEditor: vi.fn(),
        releaseEditor: vi.fn(),
      }),
      resetInstance: vi.fn(),
    },
    createModelKey: (filePath: string, sandboxId?: string) => {
      const uri = `file://${filePath}`;
      if (sandboxId) {
        return `${uri}::vm:${sandboxId}`;
      }
      return uri;
    },
  }),
);

// Import component after mocks are set up
import { DiffEditorWrapper } from "../../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/DiffEditorWrapper";
import { useDiffContent } from "../../../../../src/renderer/components/panes/editor-v2/hooks";

// ============================================================================
// Tests
// ============================================================================

describe("DiffEditorWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock model file path to default for clean test state
    setMockModelFilePath("/test/file.ts");
    // Reset to default state
    mockState.diffContent = {
      original: "original content",
      modified: "modified content",
      isLoading: false,
      error: null,
    };
    // Reset the mock implementation to use default state
    (useDiffContent as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockState.diffContent,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Loading State
  // ===========================================================================

  describe("loading state", () => {
    it("should show loading state while fetching content", () => {
      (useDiffContent as ReturnType<typeof vi.fn>).mockReturnValue({
        original: null,
        modified: null,
        isLoading: true,
        error: null,
      });

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

    it("should not set up model while loading", async () => {
      (useDiffContent as ReturnType<typeof vi.fn>).mockReturnValue({
        original: null,
        modified: null,
        isLoading: true,
        error: null,
      });

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      // Monaco diff editor model should not be set up during loading
      await waitFor(() => {
        expect(mockDiffEditor.setModel).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Error State
  // ===========================================================================

  describe("error state", () => {
    it("should show error state when fetch fails", () => {
      (useDiffContent as ReturnType<typeof vi.fn>).mockReturnValue({
        original: null,
        modified: null,
        isLoading: false,
        error: { message: "Failed to fetch git content" },
      });

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

    it("should not set up model on error", async () => {
      (useDiffContent as ReturnType<typeof vi.fn>).mockReturnValue({
        original: null,
        modified: null,
        isLoading: false,
        error: { message: "Failed to fetch git content" },
      });

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
        />,
      );

      // Monaco diff editor model should not be set up on error
      await waitFor(() => {
        expect(mockDiffEditor.setModel).not.toHaveBeenCalled();
      });
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
      mockSetTheme.mockClear();

      rerender(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/file.ts"
          theme="vs-light"
        />,
      );

      await waitFor(() => {
        expect(mockSetTheme).toHaveBeenCalledWith("vs-light");
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
        saveViewState: vi.fn(() => null),
        restoreViewState: vi.fn(),
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
      // Set mock model to match the test file path
      setMockModelFilePath("/test/file.ts");

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
      // Set mock model to match the test file path
      setMockModelFilePath("/test/file.js");

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
      // Set mock model to match the test file path
      setMockModelFilePath("/test/file.json");

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
      // Set mock model to match the test file path
      setMockModelFilePath("/test/file.xyz");

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

    it("should detect shell for .gitignore (filename-based detection)", async () => {
      // Set mock model to match the test file path
      setMockModelFilePath("/test/.gitignore");

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/.gitignore"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          expect.any(String),
          "shell",
          expect.anything(),
        );
      });
    });

    it("should detect dockerfile for Dockerfile (filename-based detection)", async () => {
      // Set mock model to match the test file path
      setMockModelFilePath("/test/Dockerfile");

      render(
        <DiffEditorWrapper
          editorId="test-diff"
          cwd="/test"
          filePath="/test/Dockerfile"
        />,
      );

      await waitFor(() => {
        expect(mockCreateModel).toHaveBeenCalledWith(
          expect.any(String),
          "dockerfile",
          expect.anything(),
        );
      });
    });
  });
});
