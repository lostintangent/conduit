/**
 * Tokenization utilities for Monaco editor.
 *
 * Monaco's background tokenization can cause a brief flash of unstyled text
 * when switching files. These utilities force synchronous tokenization of
 * visible lines to ensure syntax highlighting is ready on first paint.
 */

import type * as monaco from "monaco-editor";

/**
 * Maximum number of lines to force tokenize.
 * 100 lines covers most viewport sizes while keeping the operation fast.
 */
const MAX_LINES_TO_TOKENIZE = 100;

/**
 * Force immediate tokenization of visible lines to prevent white flash
 * before syntax highlighting kicks in.
 *
 * Monaco normally tokenizes in the background, which can cause a brief
 * flash of unstyled (white) text when a file is first displayed. By
 * forcing synchronous tokenization of the first N lines, we ensure
 * syntax colors are ready before the first paint.
 *
 * This uses Monaco's internal `tokenization.forceTokenization` API which
 * is not part of the public types but is available at runtime.
 *
 * @param model - The Monaco text model to tokenize
 * @param maxLines - Maximum lines to tokenize (default: 100)
 */
export function forceTokenizeVisibleLines(
  model: monaco.editor.ITextModel,
  maxLines: number = MAX_LINES_TO_TOKENIZE,
): void {
  // Access Monaco's internal tokenization API
  const tokenization = (
    model as unknown as {
      tokenization?: { forceTokenization: (line: number) => void };
    }
  ).tokenization;

  if (!tokenization?.forceTokenization) {
    return;
  }

  const lineCount = model.getLineCount();
  const linesToTokenize = Math.min(lineCount, maxLines);

  for (let line = 1; line <= linesToTokenize; line++) {
    tokenization.forceTokenization(line);
  }
}
