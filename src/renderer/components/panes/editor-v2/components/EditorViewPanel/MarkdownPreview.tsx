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

import { userSettingsAtom } from "@/store/atoms";
import { resolveTheme } from "@/utils/theme";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import rehypeSlug from "rehype-slug";
import remarkGithubAlerts from "remark-github-blockquote-alert";
import "remark-github-blockquote-alert/alert.css";
import { Streamdown } from "streamdown";

export interface MarkdownPreviewProps {
  /** Markdown content to render */
  content: string;
}

/**
 * Markdown preview component using streamdown.
 */
export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const { theme } = useAtomValue(userSettingsAtom);
  const resolvedTheme = resolveTheme(theme);
  const containerRef = useRef<HTMLDivElement>(null);

  // Configure mermaid to use dark theme when app is in dark mode
  const mermaidConfig = useMemo(
    () => ({
      config: {
        theme:
          resolvedTheme === "dark" ? ("dark" as const) : ("default" as const),
      },
    }),
    [resolvedTheme],
  );

  // Handle clicks on anchor links to scroll within the document
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href?.startsWith("#")) return;
    e.preventDefault();

    const id = href.slice(1);
    const element = containerRef.current?.querySelector(`[id="${id}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

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
        remarkPlugins={[remarkGithubAlerts]}
      >
        {content}
      </Streamdown>
    </div>
  );
}
