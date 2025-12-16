/**
 * MarkdownPreview - Renders markdown content using streamdown.
 *
 * Used for previewing markdown files in the editor pane.
 * Supports streaming-optimized markdown rendering with:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Syntax highlighting for code blocks
 * - Math rendering via KaTeX
 * - Mermaid diagrams
 *
 * @example
 * ```tsx
 * <MarkdownPreview content={markdownContent} />
 * ```
 */

import { Streamdown } from "streamdown";

export interface MarkdownPreviewProps {
  /** Markdown content to render */
  content: string;
}

/**
 * Markdown preview component using streamdown.
 */
export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div
      className="h-full w-full overflow-auto p-4 prose prose-invert prose-sm max-w-none"
      data-testid="markdown-preview"
    >
      <Streamdown>{content}</Streamdown>
    </div>
  );
}
