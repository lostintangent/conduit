import type * as monaco from "monaco-editor";
import { describe, expect, it } from "vitest";
import { replaceModelContent } from "@/components/panes/editor/utils/modelContent";

/** A model over a string, enough of one to apply edits as Monaco would. */
function fakeModel(initial: string, eol = "\n") {
  let value = initial;
  const lines = () => value.split(/\r\n|\r|\n/);
  const offset = (line: number, column: number) =>
    lines()
      .slice(0, line - 1)
      .reduce((total, text) => total + text.length + eol.length, column - 1);
  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  const model = {
    getLinesContent: lines,
    getEOL: () => eol,
    getLineMaxColumn: (line: number) => lines()[line - 1]!.length + 1,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: lines().length,
      endColumn: lines().at(-1)!.length + 1,
    }),
    applyEdits: (applied: monaco.editor.IIdentifiedSingleEditOperation[]) => {
      for (const edit of applied) {
        const { range, text } = edit;
        value =
          value.slice(0, offset(range.startLineNumber, range.startColumn)) +
          (text ?? "") +
          value.slice(offset(range.endLineNumber, range.endColumn));
        edits.push(edit);
      }
    },
  };
  return {
    model: model as unknown as monaco.editor.ITextModel,
    value: () => value,
    edits,
  };
}

describe("replaceModelContent", () => {
  it.each([
    ["changing a line", "a\nb\nc", "a\nB\nc"],
    ["inserting a line", "a\nc", "a\nb\nc"],
    ["deleting a line", "a\nb\nc", "a\nc"],
    ["appending lines", "a", "a\nb\nc"],
    ["deleting the last lines", "a\nb\nc", "a"],
    ["prepending a line", "b\nc", "a\nb\nc"],
    ["deleting the first line", "a\nb\nc", "b\nc"],
    ["deleting a repeated line", "a\na", "a"],
    ["changing every line", "a\nb", "x\ny"],
    ["deleting everything", "a\nb", ""],
    ["filling an empty model", "", "a\nb"],
  ])("gives the new content after %s", (_, before, after) => {
    const fake = fakeModel(before);

    replaceModelContent(fake.model, after);

    expect(fake.value()).toBe(after);
    expect(fake.edits).toHaveLength(1);
  });

  it("replaces only the lines that changed", () => {
    const fake = fakeModel("a\nb\nc\nd");

    replaceModelContent(fake.model, "a\nB\nC\nd");

    expect(fake.edits).toEqual([
      {
        range: {
          startLineNumber: 1,
          startColumn: 2,
          endLineNumber: 3,
          endColumn: 2,
        },
        text: "\nB\nC",
      },
    ]);
  });

  it("writes the model's own line endings", () => {
    const fake = fakeModel("a\r\nb\r\nc", "\r\n");

    replaceModelContent(fake.model, "a\nB\nc");

    expect(fake.value()).toBe("a\r\nB\r\nc");
  });

  it("leaves a model that already has the content alone", () => {
    const fake = fakeModel("a\r\nb", "\r\n");

    replaceModelContent(fake.model, "a\r\nb");

    expect(fake.edits).toEqual([]);
  });
});
