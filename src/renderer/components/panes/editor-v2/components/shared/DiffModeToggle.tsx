/**
 * DiffModeToggle - Toggle button for switching between diff and editor views.
 *
 * Used in:
 * - EditorToolbar (main editor toolbar)
 * - FileChangeDiff (review mode file headers)
 *
 * @example
 * ```tsx
 * <DiffModeToggle
 *   isDiffMode={isDiffMode}
 *   onToggle={() => setIsDiffMode(!isDiffMode)}
 *   variant="toolbar"
 * />
 * ```
 */

import { Columns2, FileCode } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface DiffModeToggleProps {
  /** Whether currently in diff mode */
  isDiffMode: boolean;

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
 * Toggle button for switching between diff and editor views.
 * Shows FileCode icon when in diff mode (click to switch to editor).
 * Shows Columns2 icon when in edit mode (click to switch to diff).
 */
export function DiffModeToggle({
  isDiffMode,
  onToggle,
  variant = "toolbar",
}: DiffModeToggleProps) {
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
          data-testid="diff-mode-toggle"
        >
          {isDiffMode ? (
            iconSize ? (
              <FileCode size={iconSize} />
            ) : (
              <FileCode className={iconClass} />
            )
          ) : iconSize ? (
            <Columns2 size={iconSize} />
          ) : (
            <Columns2 className={iconClass} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isDiffMode ? "Switch to editor view" : "Switch to diff view"}
      </TooltipContent>
    </Tooltip>
  );
}
