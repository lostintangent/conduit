import * as monaco from "monaco-editor";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { GitContentResult } from "../hooks/useGitContent";
import { RegularEditorWrapper } from "./RegularEditorWrapper";

const { model, editor, viewStates, git } = vi.hoisted(() => ({
  // The working directory model useMonacoModel returns. A test that switches
  // files points it at the new file, the way the hook would.
  model: {
    getValue: vi.fn(() => "file content"),
    dispose: vi.fn(),
    uri: { fsPath: "/test/file.ts" },
    onDidChangeContent: vi.fn((_listener: () => void) => ({
      dispose: vi.fn(),
    })),
  },
  editor: {
    setModel: vi.fn(),
    updateOptions: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
  },
  viewStates: { save: vi.fn(), restore: vi.fn() },
  git: { content: {} as GitContentResult },
}));

vi.mock("monaco-editor", () => ({
  editor: {
    create: vi.fn(() => editor),
    // A git side gets a model of its own, which a re-read edits in place
    createModel: vi.fn((value: string) => {
      const lines = value.split("\n");
      return {
        dispose: vi.fn(),
        getLinesContent: () => lines,
        getEOL: () => "\n",
        getLineMaxColumn: (line: number) => lines[line - 1].length + 1,
        applyEdits: vi.fn(),
      };
    }),
    setTheme: vi.fn(),
  },
  Uri: { parse: (uri: string) => ({ toString: () => uri }) },
}));

vi.mock("../hooks/useMonacoModel", () => ({ useMonacoModel: () => model }));
vi.mock("../hooks/useGitContent", () => ({
  useGitContent: () => git.content,
}));
vi.mock("../hooks/useEditorTheme", () => ({ useEditorTheme: () => "vs-dark" }));
vi.mock("../../client/ViewStateRegistry", () => ({
  ViewStateRegistry: { getInstance: () => viewStates },
}));
vi.mock("../../client/MonacoModelRegistry", () => ({
  createModelKey: (filePath: string) => `file://${filePath}`,
}));

type Props = ComponentProps<typeof RegularEditorWrapper>;

function renderEditor(props: Partial<Props> = {}) {
  const editorWith = (next: Partial<Props>) => (
    <RegularEditorWrapper
      editorId="test-editor"
      cwd="/test"
      filePath="/test/file.ts"
      {...next}
    />
  );
  const view = render(editorWith(props));
  return {
    ...view,
    rerender: (next: Partial<Props>) => view.rerender(editorWith(next)),
  };
}

const gitSide = (content: string): GitContentResult => ({
  content,
  isLoading: false,
  error: null,
});

describe("RegularEditorWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    model.uri.fsPath = "/test/file.ts";
    git.content = { content: null, isLoading: false, error: null };
  });

  describe("editor creation", () => {
    it("should create editor using monaco.editor.create on mount", () => {
      renderEditor({ theme: "vs-dark", readOnly: false });

      expect(monaco.editor.create).toHaveBeenCalledWith(
        screen.getByTestId("monaco-editor-wrapper"),
        expect.objectContaining({ theme: "vs-dark", readOnly: false }),
      );
    });

    it("should dispose editor on unmount", () => {
      const { unmount } = renderEditor();
      expect(editor.dispose).not.toHaveBeenCalled();

      unmount();

      expect(editor.dispose).toHaveBeenCalled();
    });
  });

  describe("model attachment", () => {
    it("should attach model to editor", () => {
      renderEditor();

      expect(editor.setModel).toHaveBeenCalledWith(model);
    });

    // A stage or commit outside re-reads a git side, which used to replace
    // the editor's model and reset its scroll position and selection
    it("should edit a re-read git side into its model", () => {
      git.content = gitSide("a\nb\nc");
      const { rerender } = renderEditor({ source: "index" });
      expect(editor.setModel).toHaveBeenCalledTimes(1);

      git.content = gitSide("a\nB\nc");
      rerender({ source: "index" });

      const side = vi.mocked(monaco.editor.createModel).mock.results[0].value;
      expect(side.applyEdits).toHaveBeenCalledWith([
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
      expect(monaco.editor.createModel).toHaveBeenCalledTimes(1);
      expect(editor.setModel).toHaveBeenCalledTimes(1);

      // Another source is another model
      rerender({ source: "head" });
      expect(monaco.editor.createModel).toHaveBeenCalledTimes(2);
    });
  });

  describe("viewstate management", () => {
    it("should restore viewstate for file", () => {
      renderEditor();

      expect(viewStates.restore).toHaveBeenCalledWith(
        "test-editor",
        "/test/file.ts",
        editor,
      );
    });

    it("should save viewstate on unmount", () => {
      const { unmount } = renderEditor();
      expect(viewStates.save).not.toHaveBeenCalled();

      unmount();

      expect(viewStates.save).toHaveBeenCalledWith(
        "test-editor",
        "/test/file.ts",
        editor,
      );
    });
  });

  describe("options updates", () => {
    it("should update editor options when theme changes", () => {
      const { rerender } = renderEditor({ theme: "vs-dark" });

      rerender({ theme: "vs-light" });

      expect(editor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "vs-light" }),
      );
    });

    it("should update editor options when readOnly changes", () => {
      const { rerender } = renderEditor({ readOnly: false });

      rerender({ readOnly: true });

      expect(editor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ readOnly: true }),
      );
    });

    // Recreating the editor dropped its model, and the model effect didn't
    // attach it again, so the open file went blank.
    it.each<[string, Partial<Props>]>([
      ["theme", { theme: "vs-light" }],
      ["readOnly", { readOnly: true }],
    ])("should keep the open file when %s changes", (_, changed) => {
      const props = { theme: "vs-dark", readOnly: false };
      const { rerender } = renderEditor(props);
      expect(editor.setModel).toHaveBeenCalledWith(model);

      rerender({ ...props, ...changed });

      expect(editor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining(changed),
      );
      expect(monaco.editor.create).toHaveBeenCalledTimes(1);
      expect(editor.dispose).not.toHaveBeenCalled();
    });
  });

  describe("focus handling", () => {
    it("should focus editor when container is clicked", () => {
      renderEditor();

      fireEvent.click(screen.getByTestId("monaco-editor-wrapper"));

      expect(editor.focus).toHaveBeenCalled();
    });
  });

  describe("callbacks", () => {
    it("should call onMount when editor is ready", () => {
      const onMount = vi.fn();

      renderEditor({ onMount });

      expect(onMount).toHaveBeenCalledWith(editor);
    });

    it("should set up onChange listener when onChange is provided", () => {
      const onChange = vi.fn();
      renderEditor({ onChange });

      const [contentChanged] = model.onDidChangeContent.mock.calls[0];
      contentChanged();

      expect(onChange).toHaveBeenCalledWith("file content");
    });
  });

  describe("default props", () => {
    it("should use vs-dark theme by default", () => {
      renderEditor();

      expect(monaco.editor.create).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ theme: "vs-dark" }),
      );
    });

    it("should not be read-only by default", () => {
      renderEditor();

      expect(monaco.editor.create).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ readOnly: false }),
      );
    });
  });

  describe("file path changes", () => {
    function openFile1ThenFile2() {
      model.uri.fsPath = "/test/file1.ts";
      const { rerender } = renderEditor({ filePath: "/test/file1.ts" });
      expect(viewStates.restore).toHaveBeenCalledWith(
        "test-editor",
        "/test/file1.ts",
        editor,
      );
      viewStates.save.mockClear();
      viewStates.restore.mockClear();

      model.uri.fsPath = "/test/file2.ts";
      rerender({ filePath: "/test/file2.ts" });
    }

    it("should save viewstate for old file when switching files", () => {
      openFile1ThenFile2();

      expect(viewStates.save).toHaveBeenCalledWith(
        "test-editor",
        "/test/file1.ts",
        editor,
      );
    });

    it("should restore viewstate for new file after switching", () => {
      openFile1ThenFile2();

      expect(viewStates.restore).toHaveBeenCalledWith(
        "test-editor",
        "/test/file2.ts",
        editor,
      );
    });
  });
});
