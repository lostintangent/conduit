import type * as monaco from "monaco-editor";

/**
 * Change a model's content to `value` by replacing only the lines between the
 * first and last that differ, as VS Code does when a document changes under
 * an open editor. Unlike `setValue`, which resets every editor showing the
 * model, this keeps cursors, selections and the scroll position outside the
 * change. It skips the undo stack, so it's for models the user doesn't edit.
 */
export function replaceModelContent(
  model: monaco.editor.ITextModel,
  value: string,
): void {
  const before = model.getLinesContent();
  const after = value.split(/\r\n|\r|\n/);
  const shorter = Math.min(before.length, after.length);
  let start = 0;
  while (start < shorter && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < shorter - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  if (start === before.length && start === after.length) return;

  const eol = model.getEOL();
  const lastChanged = before.length - end;
  const lines = after.slice(start, after.length - end);
  let range: monaco.IRange;
  let text: string;
  if (start > 0) {
    // From the end of the last unchanged line, so it works at either end
    range = {
      startLineNumber: start,
      startColumn: model.getLineMaxColumn(start),
      endLineNumber: lastChanged,
      endColumn: model.getLineMaxColumn(lastChanged),
    };
    text = lines.map((line) => eol + line).join("");
  } else if (end > 0) {
    // Up to the start of the first unchanged line
    range = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: lastChanged + 1,
      endColumn: 1,
    };
    text = lines.map((line) => line + eol).join("");
  } else {
    range = model.getFullModelRange();
    text = lines.join(eol);
  }
  model.applyEdits([{ range, text }]);
}
