/**
 * useMarkdownPreview Hook
 *
 * Provides configuration and handlers for rendering markdown content.
 * Handles theme-aware mermaid configuration and anchor link navigation.
 *
 * @example
 * ```tsx
 * function MarkdownViewer({ content }: Props) {
 *   const { mermaidConfig, handleClick, containerRef } = useMarkdownPreview();
 *
 *   return (
 *     <div ref={containerRef} onClick={handleClick}>
 *       <Streamdown mermaid={mermaidConfig}>{content}</Streamdown>
 *     </div>
 *   );
 * }
 * ```
 */

import { userSettingsAtom } from "@/store/atoms";
import { resolveTheme } from "@/utils/theme";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useMemo, useRef } from "react";

/**
 * Mermaid configuration for Streamdown.
 */
export interface MermaidConfig {
  config: {
    theme: "dark" | "default";
  };
}

/**
 * Result of the useMarkdownPreview hook.
 */
export interface UseMarkdownPreviewResult {
  /** Mermaid diagram configuration based on current theme */
  mermaidConfig: MermaidConfig;
  /** Click handler for anchor link navigation */
  handleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Ref to attach to the container element for scroll navigation */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook to provide markdown preview configuration and handlers.
 *
 * @returns Mermaid config, click handler, and container ref
 */
export function useMarkdownPreview(): UseMarkdownPreviewResult {
  const { theme } = useSelector(userSettingsAtom);
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

  return { mermaidConfig, handleClick, containerRef };
}
