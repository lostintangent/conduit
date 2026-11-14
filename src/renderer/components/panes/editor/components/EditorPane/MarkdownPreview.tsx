/**
 * MarkdownPreview - Renders markdown content using streamdown.
 *
 * Used for previewing markdown files in the editor pane.
 * Supports streaming-optimized markdown rendering with:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - CJK-friendly emphasis (@streamdown/cjk)
 * - Syntax highlighting for code blocks via Shiki (@streamdown/code, loaded on first use)
 * - KaTeX for `$$` blocks and ```math fences (@streamdown/math)
 * - Mermaid diagrams (@streamdown/mermaid, loaded on first use)
 *
 * Streamdown provides its own styling via Tailwind classes, which are
 * included via the @source directive in index.css.
 *
 * @example
 * ```tsx
 * <MarkdownPreview content={markdownContent} />
 * ```
 */

import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import type { MermaidConfig } from "@streamdown/mermaid";
import rehypeSlug from "rehype-slug";
import remarkGithubAlerts from "remark-github-blockquote-alert";
import "remark-github-blockquote-alert/alert.css";
import {
  type CodeHighlighterPlugin,
  type DiagramPlugin,
  defaultRemarkPlugins,
  Streamdown,
} from "streamdown";
import { useMarkdownPreview } from "../../hooks/useMarkdownPreview";

// @streamdown/code and @streamdown/mermaid import Shiki and Mermaid eagerly,
// so each one loads when the first code block or diagram renders.
let shiki: CodeHighlighterPlugin | undefined;
const code: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getThemes: () => ["github-light", "github-dark"],
  // Streamdown only calls getThemes and highlight.
  getSupportedLanguages: () => shiki?.getSupportedLanguages() ?? [],
  supportsLanguage: (language) => shiki?.supportsLanguage(language) ?? false,
  highlight(options, callback) {
    if (shiki) return shiki.highlight(options, callback);
    void import("@streamdown/code").then((m) => {
      shiki = m.code;
      const result = shiki.highlight(options, callback);
      if (result) callback?.(result);
    });
    return null;
  },
};

const mermaid: DiagramPlugin = {
  name: "mermaid",
  type: "diagram",
  language: "mermaid",
  getMermaid(config) {
    const instance = import("@streamdown/mermaid").then((m) =>
      m.mermaid.getMermaid(config as MermaidConfig),
    );
    return {
      initialize: (next) =>
        void instance.then((i) => i.initialize(next as MermaidConfig)),
      render: (id, source) => instance.then((i) => i.render(id, source)),
    };
  },
};

const plugins = { cjk, code, math, mermaid };
const linkSafety = { enabled: false };

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
      {/* KaTeX's stylesheet is copied next to index.html by build/bun.build.ts
          rather than imported, which would inline its fonts into the startup
          CSS. Fonts still load only when math uses them. */}
      <link rel="stylesheet" href="katex/katex.min.css" precedence="default" />
      <Streamdown
        mode="static"
        plugins={plugins}
        linkSafety={linkSafety}
        // Show code blocks and tables at full height, as streamdown 1 did,
        // rather than scrolling them inside the scrolling preview.
        codeBlockMaxHeight={0}
        tableMaxHeight={0}
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
