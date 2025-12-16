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
import { useMemo } from "react";
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

  return (
    <div
      className="h-full w-full overflow-auto p-4 text-foreground"
      data-testid="markdown-preview"
    >
      <Streamdown mode="static" mermaid={mermaidConfig}>
        {content}
      </Streamdown>
    </div>
  );
}
