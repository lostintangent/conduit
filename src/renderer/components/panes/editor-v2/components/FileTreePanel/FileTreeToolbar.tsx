/**
 * FileTreeToolbar - Header toolbar for the file tree with navigation and controls.
 *
 * Styled to match v1's tree header:
 * - px-3 py-1.5 bg-elevated text-[13px]
 * - p-1 rounded hover:bg-white/10 buttons
 * - size={14} icons
 */

import { FolderUp, PanelLeftClose } from "lucide-react";
import { useAtomValue } from "jotai";
import { userSettingsAtom } from "@/store/atoms";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FileTreeToolbarProps {
  /** Current working directory */
  cwd: string;

  /** Whether navigation up is possible (false at filesystem root) */
  canNavigateUp: boolean;

  /** Callback when navigate up is clicked */
  onNavigateUp: () => void;

  /** Whether the tree panel is currently collapsed */
  isCollapsed?: boolean;

  /** Callback when collapse toggle is clicked */
  onToggleCollapse?: () => void;

  /** Whether to show the collapse button (only in split layout mode) */
  showCollapseButton?: boolean;
}

/**
 * Format directory path for display.
 * Replaces home directory with ~ prefix, otherwise shows full path.
 * Matches v1 behavior.
 */
function formatDisplayPath(cwd: string, homeDirectory?: string): string {
  if (!homeDirectory) {
    return cwd;
  }

  const normalizedPath = cwd.replace(/\\/g, "/");
  const normalizedHome = homeDirectory.replace(/\\/g, "/");

  if (normalizedPath === normalizedHome) {
    return "~";
  }

  const homeWithSlash = normalizedHome.endsWith("/")
    ? normalizedHome
    : `${normalizedHome}/`;

  if (normalizedPath.startsWith(homeWithSlash)) {
    const suffix = normalizedPath.slice(homeWithSlash.length);
    return suffix ? `~/${suffix}` : "~";
  }

  return cwd;
}

/**
 * Check if a path is at the filesystem root.
 */
function isAtRoot(cwd: string): boolean {
  const normalized = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;

  if (normalized === "" || normalized === "/") {
    return true;
  }

  if (/^[A-Za-z]:$/.test(normalized) || /^[A-Za-z]:\\?$/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * File tree header toolbar with navigation and collapse controls.
 * Styled to match v1's header.
 */
export function FileTreeToolbar({
  cwd,
  canNavigateUp,
  onNavigateUp,
  isCollapsed = false,
  onToggleCollapse,
  showCollapseButton = false,
}: FileTreeToolbarProps) {
  const { homeDirectory } = useAtomValue(userSettingsAtom);
  const displayPath = formatDisplayPath(cwd, homeDirectory);
  const isRoot = isAtRoot(cwd);
  const canGoUp = canNavigateUp && !isRoot;

  // Suppress unused variable warning
  void isCollapsed;

  // Common button class matching v1
  const buttonClass =
    "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

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
                <span>Toggle sidebar</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  ⌘B
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Current directory */}
        <span className="truncate" title={cwd} data-testid="current-directory">
          {displayPath}
        </span>
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
