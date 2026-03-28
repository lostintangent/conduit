/**
 * MarkdownPreview - Renders markdown content using streamdown.
 *
 * Used for previewing markdown files in the editor pane.
 * Supports streaming-optimized markdown rendering with:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Syntax highlighting for code blocks via Shiki
 * - Math rendering via KaTeX
 * - Mermaid diagrams
 *
 * Streamdown provides its own styling via Tailwind classes, which are
 * included via the @source directive in index.css.
 *
 * @example
 * ```tsx
 * <MarkdownPreview content={markdownContent} />
 * ```
 */

import rehypeSlug from "rehype-slug";
import remarkGithubAlerts from "remark-github-blockquote-alert";
import "remark-github-blockquote-alert/alert.css";
import { defaultRemarkPlugins, Streamdown } from "streamdown";
import { useMarkdownPreview } from "../../hooks/useMarkdownPreview";

export interface MarkdownPreviewProps {
  /** Markdown content to render */
  content: string;
}

/**
 * Markdown preview component using streamdown.
 */
export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const { mermaidConfig, handleClick, containerRef } = useMarkdownPreview();

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto p-4 text-sm text-foreground [&>*>*:first-child]:mt-0 [&_[data-streamdown=code-block-body]_code>span:last-child:empty]:hidden [&_[data-streamdown=code-block]>*]:p-2 [&_.markdown-alert]:!py-0 [&_.markdown-alert>*:first-child]:mb-3"
      onClick={handleClick}
    >
      <Streamdown
        mode="static"
        mermaid={mermaidConfig}
        rehypePlugins={[rehypeSlug]}
        remarkPlugins={[
          ...Object.values(defaultRemarkPlugins),
          remarkGithubAlerts,
        ]}
      >
        {content}
      </Streamdown>
    </div>
  );
}
