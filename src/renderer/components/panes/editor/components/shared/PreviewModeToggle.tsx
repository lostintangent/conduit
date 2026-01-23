/**
 * PreviewModeToggle - Toggle button for switching between editor and preview views.
 *
 * Used in EditorToolbar for supported file types (markdown, etc.).
 *
 * @example
 * ```tsx
 * <PreviewModeToggle
 *   isPreviewMode={isPreviewMode}
 *   onToggle={() => setIsPreviewMode(!isPreviewMode)}
 *   variant="toolbar"
 * />
 * ```
 */

import { Eye, FileEdit } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PreviewModeToggleProps {
  /** Whether currently in preview mode */
  isPreviewMode: boolean;

  /** Handler for toggle click */
  onToggle: (e: React.MouseEvent) => void;

  /**
   * Visual variant:
   * - "toolbar": For use in EditorToolbar (matches toolbar button styling)
   * - "compact": For use in file headers (smaller, denser)
   */
  variant?: "toolbar" | "compact";
}

/**
 * Toggle button for switching between preview and editor views.
 * Shows FileEdit icon when in preview mode (click to switch to editor).
 * Shows Eye icon when in edit mode (click to switch to preview).
 */
export function PreviewModeToggle({
  isPreviewMode,
  onToggle,
  variant = "toolbar",
}: PreviewModeToggleProps) {
  const isToolbar = variant === "toolbar";

  const buttonClass = isToolbar
    ? "p-1 rounded hover:bg-white/10 transition-colors shrink-0"
    : "h-6 w-6 p-0 rounded hover:bg-accent transition-colors flex-shrink-0 inline-flex items-center justify-center";

  const iconClass = isToolbar ? undefined : "h-3.5 w-3.5";
  const iconSize = isToolbar ? 14 : undefined;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className={buttonClass}
          data-testid="preview-mode-toggle"
        >
          {isPreviewMode ? (
            iconSize ? (
              <FileEdit size={iconSize} />
            ) : (
              <FileEdit className={iconClass} />
            )
          ) : iconSize ? (
            <Eye size={iconSize} />
          ) : (
            <Eye className={iconClass} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isPreviewMode ? "Switch to editor view" : "Switch to preview"}
      </TooltipContent>
    </Tooltip>
  );
}
