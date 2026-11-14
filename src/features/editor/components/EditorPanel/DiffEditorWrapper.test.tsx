import * as monaco from "monaco-editor";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useAutoSizeEditor } from "../hooks/useAutoSizeEditor";
import type { DiffContent } from "../hooks/useDiffContent";
import { DiffEditorWrapper } from "./DiffEditorWrapper";

const { model, modifiedEditor, diffEditor, diff, made } = vi.hoisted(() => {
  // Names each view model and side model as it's made, and logs their
  // disposal in order
  const made = { viewModels: 0, models: 0, disposed: [] as string[] };
  const modifiedEditor = { focus: vi.fn(), saveViewState: () => null };
  return {
    made,
    // The working directory model useMonacoModel returns. A test that
    // switches files points it at the new file, the way the hook would.
    model: {
      getValue: () => "modified content",
      uri: {
        fsPath: "/test/file.ts",
        toString() {
          return `file://${this.fsPath}`;
        },
      },
      onDidChangeContent: vi.fn((_listener: () => void) => ({
        dispose: vi.fn(),
      })),
    },
    modifiedEditor,
    diffEditor: {
      createViewModel: vi.fn(() => {
        const name = `viewModel${++made.viewModels}`;
        return { dispose: () => made.disposed.push(name) };
      }),
      setModel: vi.fn(),
      getModifiedEditor: () => modifiedEditor,
      updateOptions: vi.fn(),
      revealFirstDiff: vi.fn(),
      dispose: vi.fn(),
    },
    diff: { content: {} as DiffContent },
  };
});

vi.mock("monaco-editor", () => ({
  editor: {
    createDiffEditor: vi.fn(() => diffEditor),
    // The original side, and a git modified side, get models of their own,
    // which a re-read edits in place
    createModel: vi.fn((value: string) => {
      const lines = value.split("\n");
      const name = `model${++made.models}`;
      return {
        getLinesContent: () => lines,
        getEOL: () => "\n",
        getLineMaxColumn: (line: number) => lines[line - 1].length + 1,
        applyEdits: vi.fn(),
        dispose: () => made.disposed.push(name),
      };
    }),
    setTheme: vi.fn(),
  },
  Uri: { parse: (uri: string) => ({ toString: () => uri }) },
}));

vi.mock("../hooks/useDiffContent", () => ({
  useDiffContent: () => diff.content,
}));
vi.mock("../hooks/useMonacoModel", () => ({ useMonacoModel: () => model }));
vi.mock("../hooks/useEditorTheme", () => ({ useEditorTheme: () => "vs-dark" }));
// The real hook sizes the container from the editors' content heights
vi.mock("../hooks/useAutoSizeEditor", () => ({
  useAutoSizeEditor: vi.fn(() => ({ containerRef: { current: null } })),
}));
vi.mock("../../client/MonacoModelRegistry", () => ({
  createModelKey: (filePath: string) => `file://${filePath}`,
}));

type Props = ComponentProps<typeof DiffEditorWrapper>;

function renderDiff(props: Partial<Props> = {}) {
  const diffWith = (next: Partial<Props>) => (
    <DiffEditorWrapper
      editorId="test-diff"
      cwd="/test"
      filePath="/test/file.ts"
      {...next}
    />
  );
  const view = render(diffWith(props));
  return {
    ...view,
    rerender: (next: Partial<Props>) => view.rerender(diffWith(next)),
  };
}

const diffContent = (overrides: Partial<DiffContent> = {}): DiffContent => ({
  original: "original content",
  modified: "modified content",
  isLoading: false,
  error: null,
  errorMessage: null,
  isModifiedEditable: true,
  ...overrides,
});

describe("DiffEditorWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    model.uri.fsPath = "/test/file.ts";
    diff.content = diffContent();
    Object.assign(made, { viewModels: 0, models: 0, disposed: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loading state", () => {
    beforeEach(() => {
      diff.content = diffContent({
        original: null,
        modified: null,
        isLoading: true,
      });
    });

    it("should show loading state while fetching content", () => {
      renderDiff();

      expect(screen.getByTestId("diff-editor-loading").textContent).toBe(
        "Loading diff...",
      );
    });

    it("should not set up model while loading", () => {
      renderDiff();

      expect(diffEditor.setModel).not.toHaveBeenCalled();
    });
  });

  describe("error state", () => {
    beforeEach(() => {
      diff.content = diffContent({
        original: null,
        modified: null,
        error: { type: "unknown", message: "Failed to fetch git content" },
      });
    });

    it("should show error state when fetch fails", () => {
      renderDiff();

      expect(screen.getByTestId("diff-editor-error").textContent).toBe(
        "Failed to fetch git content",
      );
    });

    it("should not set up model on error", () => {
      renderDiff();

      expect(diffEditor.setModel).not.toHaveBeenCalled();
    });
  });

  describe("diff editor creation", () => {
    it("should create diff editor with correct options", () => {
      renderDiff({ theme: "vs-dark", readOnly: false });

      expect(monaco.editor.createDiffEditor).toHaveBeenCalledWith(
        screen.getByTestId("diff-editor-wrapper"),
        expect.objectContaining({ theme: "vs-dark", renderSideBySide: true }),
      );
      // readOnly is set via updateOptions after creation
      expect(diffEditor.updateOptions).toHaveBeenCalledWith({
        readOnly: false,
      });
    });

    it("should hand the created editor to auto-size", () => {
      renderDiff({ autoSize: 400 });

      expect(useAutoSizeEditor).toHaveBeenLastCalledWith({
        diffEditor,
        maxHeight: 400,
      });
    });
  });

  describe("model setup", () => {
    it("should create original model from git content", () => {
      renderDiff();

      expect(monaco.editor.createModel).toHaveBeenCalledWith(
        "original content",
        "typescript",
        expect.anything(),
      );
    });

    it("should set models on diff editor", () => {
      renderDiff();

      const original = vi.mocked(monaco.editor.createModel).mock.results[0]
        .value;
      expect(diffEditor.createViewModel).toHaveBeenCalledWith({
        original,
        modified: model,
      });
      expect(diffEditor.setModel).toHaveBeenCalledWith(
        diffEditor.createViewModel.mock.results[0].value,
      );
    });

    // A stage or commit outside re-reads a git side, which used to rebuild
    // the diff and scroll it back to its first change
    it("should edit a re-read git side into its model, keeping the diff", () => {
      vi.useFakeTimers();
      diff.content = diffContent({
        original: "a\nb\nc",
        modified: "a\nB\nc",
        isModifiedEditable: false,
      });
      const { rerender } = renderDiff({
        originalSource: "head",
        modifiedSource: "index",
      });
      vi.advanceTimersByTime(100);
      expect(diffEditor.revealFirstDiff).toHaveBeenCalledTimes(1);

      diff.content = { ...diff.content, original: "a\nB\nc" };
      rerender({ originalSource: "head", modifiedSource: "index" });
      vi.advanceTimersByTime(100);

      const [original, modified] = vi
        .mocked(monaco.editor.createModel)
        .mock.results.map((result) => result.value);
      expect(original.applyEdits).toHaveBeenCalledWith([
        {
          range: {
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 2,
            endColumn: 2,
          },
          text: "\nB",
        },
      ]);
      expect(modified.applyEdits).not.toHaveBeenCalled();
      expect(monaco.editor.createModel).toHaveBeenCalledTimes(2);
      expect(diffEditor.createViewModel).toHaveBeenCalledTimes(1);
      expect(diffEditor.revealFirstDiff).toHaveBeenCalledTimes(1);

      // Comparing with another source is another diff
      rerender({ originalSource: "index", modifiedSource: "index" });
      expect(diffEditor.createViewModel).toHaveBeenCalledTimes(2);
    });
  });

  describe("options updates", () => {
    it("should update theme globally when theme changes", () => {
      const { rerender } = renderDiff({ theme: "vs-dark" });

      rerender({ theme: "vs-light" });

      expect(monaco.editor.setTheme).toHaveBeenLastCalledWith("vs-light");
    });

    // Recreating the editor on a theme change dropped its models, and nothing
    // set them again, so an open diff went blank.
    it("should keep the diff when the theme changes", () => {
      const { rerender } = renderDiff({ theme: "vs-dark" });

      rerender({ theme: "vs-light" });

      expect(monaco.editor.setTheme).toHaveBeenLastCalledWith("vs-light");
      expect(monaco.editor.createDiffEditor).toHaveBeenCalledTimes(1);
      expect(diffEditor.setModel).toHaveBeenLastCalledWith(
        diffEditor.createViewModel.mock.results[0].value,
      );
    });

    it("should update diff editor options when readOnly changes", () => {
      const { rerender } = renderDiff({ readOnly: false });
      expect(diffEditor.updateOptions).not.toHaveBeenCalledWith({
        readOnly: true,
      });

      rerender({ readOnly: true });

      expect(diffEditor.updateOptions).toHaveBeenLastCalledWith({
        readOnly: true,
      });
    });
  });

  describe("focus handling", () => {
    it("should focus modified editor when container is clicked", () => {
      renderDiff();
      expect(modifiedEditor.focus).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId("diff-editor-wrapper"));

      expect(modifiedEditor.focus).toHaveBeenCalled();
    });
  });

  describe("callbacks", () => {
    it("should call onMount when diff editor is ready", () => {
      const onMount = vi.fn();
      renderDiff({ onMount });

      expect(onMount).toHaveBeenCalledWith(diffEditor);
    });

    it("should set up onChange listener when onChange is provided", () => {
      const onChange = vi.fn();
      renderDiff({ onChange });

      const [contentChanged] = model.onDidChangeContent.mock.calls[0];
      contentChanged();

      expect(onChange).toHaveBeenCalledWith("modified content");
    });
  });

  describe("default props", () => {
    it("should use vs-dark theme by default", () => {
      renderDiff();

      expect(monaco.editor.createDiffEditor).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ theme: "vs-dark" }),
      );
    });

    it("should not be read-only by default", () => {
      renderDiff();

      expect(diffEditor.updateOptions).toHaveBeenCalledWith({
        readOnly: false,
      });
      expect(diffEditor.updateOptions).not.toHaveBeenCalledWith({
        readOnly: true,
      });
    });
  });

  describe("cleanup", () => {
    it("should dispose diff editor on unmount", () => {
      const { unmount } = renderDiff();
      expect(diffEditor.dispose).not.toHaveBeenCalled();

      unmount();

      expect(diffEditor.dispose).toHaveBeenCalled();
    });

    // Disposing the view model cancels a diff still computing on the worker,
    // which otherwise fails once its original model is gone. Monaco never
    // disposes a view model it creates from plain models.
    describe("view model disposal", () => {
      it("should dispose the view model before the original model on unmount", () => {
        const { unmount } = renderDiff();
        expect(made.disposed).toEqual([]);

        unmount();

        expect(made.disposed).toEqual(["viewModel1", "model1"]);
      });

      it("should dispose the previous view model before its original model when the file changes", () => {
        const { rerender } = renderDiff();

        model.uri.fsPath = "/test/other.ts";
        rerender({ filePath: "/test/other.ts" });

        expect(diffEditor.createViewModel).toHaveBeenCalledTimes(2);
        expect(made.disposed).toEqual(["viewModel1", "model1"]);
      });
    });
  });

  describe("language detection", () => {
    it.each([
      ["should detect typescript for .ts files", "/test/file.ts", "typescript"],
      ["should detect javascript for .js files", "/test/file.js", "javascript"],
      ["should detect json for .json files", "/test/file.json", "json"],
      [
        "should default to plaintext for unknown extensions",
        "/test/file.xyz",
        "plaintext",
      ],
      [
        "should detect shell for .gitignore (filename-based detection)",
        "/test/.gitignore",
        "shell",
      ],
      [
        "should detect dockerfile for Dockerfile (filename-based detection)",
        "/test/Dockerfile",
        "dockerfile",
      ],
    ])("%s", (_title, filePath, language) => {
      model.uri.fsPath = filePath;
      renderDiff({ filePath });

      expect(monaco.editor.createModel).toHaveBeenCalledWith(
        "original content",
        language,
        expect.anything(),
      );
    });
  });
});
