/**
 * FileTreeToolbar - Header toolbar for the file tree with navigation and controls.
 *
 * Styled to match v1's tree header:
 * - px-3 py-1.5 bg-elevated text-[13px]
 * - p-1 rounded hover:bg-white/10 buttons
 * - size={14} icons
 */

import { ApplicationCommands } from "@/commands/applicationCommands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@features/settings/client/queries";
import { formatHomePath } from "@/utils/pathUtils";
import { FolderUp, PanelLeftClose } from "lucide-react";
import { useCallback, useState } from "react";

export interface FileTreeToolbarProps {
  /** Current working directory */
  cwd: string;

  /** Whether navigation up is possible (false at filesystem root) */
  canNavigateUp: boolean;

  /** Callback when navigate up is clicked */
  onNavigateUp: () => void;

  /** Callback when collapse toggle is clicked */
  onToggleCollapse?: () => void;

  /** Whether to show the collapse button (only in split layout mode) */
  showCollapseButton?: boolean;
}

/**
 * Check if a path is at the filesystem root.
 */
function isAtRoot(cwd: string): boolean {
  return cwd === "" || cwd === "/";
}

/**
 * File tree header toolbar with navigation and collapse controls.
 * Styled to match v1's header.
 */
export function FileTreeToolbar({
  cwd,
  canNavigateUp,
  onNavigateUp,
  onToggleCollapse,
  showCollapseButton = false,
}: FileTreeToolbarProps) {
  const homeDirectory = useSettings((s) => s.homeDirectory);
  const displayPath = formatHomePath(cwd, homeDirectory);
  const isRoot = isAtRoot(cwd);
  const canGoUp = canNavigateUp && !isRoot;
  const [copied, setCopied] = useState(false);

  const handleCopyPath = useCallback(() => {
    if (cwd) {
      navigator.clipboard.writeText(cwd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [cwd]);

  // Common button class matching v1
  const buttonClass =
    "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  const toggleSideBarCmd = useCommand(
    ApplicationCommands.EDITOR_TOGGLE_SIDEBAR,
  );

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 bg-elevated text-[13px] border-b border-border"
      data-testid="file-tree-toolbar"
    >
      {/* Left side: collapse button + path */}
      <div className="flex items-center gap-2 truncate">
        {/* Collapse button (split mode only) */}
        {showCollapseButton && onToggleCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleCollapse}
                className={buttonClass}
                data-testid="collapse-toggle-button"
              >
                <PanelLeftClose size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                {getCommandDisplayTitle(toggleSideBarCmd)}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Current directory - click to copy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopyPath}
              className="truncate cursor-pointer hover:text-foreground/80 transition-colors text-left"
              data-testid="current-directory"
            >
              {displayPath}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {copied ? "Copied!" : `${cwd} - Click to copy`}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Right side: navigate up button */}
      <div className="flex items-center gap-1 shrink-0">
        {canGoUp && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onNavigateUp}
                className={buttonClass}
                data-testid="navigate-up-button"
              >
                <FolderUp size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Go up one directory</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
