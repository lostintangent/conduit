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
  getValue: vi.fn(() => "deleted file content"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  uri: { toString: () => "file:///test/deleted-file.ts" },
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
  getDomNode: vi.fn(() => document.createElement("div")),
  layout: vi.fn(),
};

// Mock git API
const mockGitApi = {
  getFileAtRef: vi.fn(),
  whenReady: vi.fn(() => Promise.resolve()),
};

// Mock useGitV2 hook
vi.mock("../../../../../src/renderer/hooks/useGitV2", () => ({
  useGitV2: vi.fn(() => mockGitApi),
}));

// Mock editor hooks
vi.mock("../../../../../src/renderer/components/panes/editor-v2/hooks", () => ({
  useEditorTheme: vi.fn(() => "vs-dark"),
  useAutoSizeEditor: vi.fn(() => ({
    height: 100,
    enabled: false,
    containerStyle: { height: "100%", width: "100%" },
  })),
}));

// Mock monaco-editor
vi.mock("monaco-editor", () => ({
  editor: {
    create: vi.fn(() => mockEditor),
    createModel: vi.fn(() => mockModel),
    setTheme: vi.fn(),
    defineTheme: vi.fn(),
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ toString: () => uri })),
  },
}));

// Mock language detection
vi.mock(
  "../../../../../src/renderer/components/panes/editor-v2/utils/languageDetection",
  () => ({
    detectLanguage: vi.fn(() => "typescript"),
  }),
);

// Import after mocks are set up
import { DeletedFileViewer } from "../../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/DeletedFileViewer";
import * as monaco from "monaco-editor";

// ============================================================================
// Tests
// ============================================================================

describe("DeletedFileViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: git returns content successfully
    mockGitApi.getFileAtRef.mockResolvedValue("content from git");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Rendering
  // ===========================================================================

  describe("rendering", () => {
    it("should render the editor container", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("deleted-file-viewer")).toBeDefined();
      });
    });

    it("should show deleted file banner after loading", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/This file has been deleted/)).toBeDefined();
      });
    });

    it("should show base branch name in banner", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
          baseBranch="main"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Showing content from/)).toBeDefined();
        expect(screen.getByText(/main/)).toBeDefined();
      });
    });

    it("should show HEAD in banner when no baseBranch specified", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/HEAD/)).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Loading State
  // ===========================================================================

  describe("loading state", () => {
    it("should show loading message while fetching content", async () => {
      // Make git call hang
      mockGitApi.getFileAtRef.mockImplementation(() => new Promise(() => {}));

      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      expect(screen.getByTestId("deleted-file-viewer-loading")).toBeDefined();
      expect(screen.getByText("Loading deleted file...")).toBeDefined();
    });

    it("should hide loading message after content loads", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(screen.queryByTestId("deleted-file-viewer-loading")).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Error State
  // ===========================================================================

  describe("error state", () => {
    it("should show error message when git fetch fails", async () => {
      mockGitApi.getFileAtRef.mockRejectedValue(
        new Error("Failed to get file from git"),
      );

      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("deleted-file-viewer-error")).toBeDefined();
        expect(screen.getByText("Failed to get file from git")).toBeDefined();
      });
    });

    it("should not show banner when there is an error", async () => {
      mockGitApi.getFileAtRef.mockRejectedValue(new Error("Git error"));

      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("deleted-file-viewer-error")).toBeDefined();
      });

      expect(screen.queryByText(/This file has been deleted/)).toBeNull();
    });
  });

  // ===========================================================================
  // Git Content Loading
  // ===========================================================================

  describe("git content loading", () => {
    it("should fetch content from git with correct ref", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
          baseBranch="feature-branch"
        />,
      );

      await waitFor(() => {
        expect(mockGitApi.getFileAtRef).toHaveBeenCalledWith(
          "/test/deleted-file.ts",
          "feature-branch",
        );
      });
    });

    it("should use HEAD when baseBranch is not specified", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(mockGitApi.getFileAtRef).toHaveBeenCalledWith(
          "/test/deleted-file.ts",
          "HEAD",
        );
      });
    });
  });

  // ===========================================================================
  // Editor Creation
  // ===========================================================================

  describe("editor creation", () => {
    it("should create read-only editor after content loads", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            readOnly: true,
            value: "content from git",
          }),
        );
      });
    });

    it("should detect language from file path", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalledWith(
          expect.any(HTMLElement),
          expect.objectContaining({
            language: "typescript",
          }),
        );
      });
    });

    it("should dispose editor on unmount", async () => {
      const { unmount } = render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
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
  // Focus Handling
  // ===========================================================================

  describe("focus handling", () => {
    it("should focus editor when container is clicked", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
        />,
      );

      await waitFor(() => {
        expect(monaco.editor.create).toHaveBeenCalled();
      });

      const container = screen.getByTestId("deleted-file-viewer");
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
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
          onMount={mockOnMount}
        />,
      );

      await waitFor(() => {
        expect(mockOnMount).toHaveBeenCalledWith(expect.any(Object));
      });
    });
  });

  // ===========================================================================
  // Theme
  // ===========================================================================

  describe("theme", () => {
    it("should use theme from useEditorTheme hook", async () => {
      render(
        <DeletedFileViewer
          editorId="test-deleted-viewer"
          cwd="/test"
          filePath="/test/deleted-file.ts"
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
  });
});
