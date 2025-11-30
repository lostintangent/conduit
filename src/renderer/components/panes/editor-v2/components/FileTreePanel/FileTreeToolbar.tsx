/**
 * FileTreeToolbar - Header toolbar for the file tree with navigation and controls.
 *
 * Styled to match v1's tree header:
 * - px-3 py-1.5 bg-elevated text-[13px]
 * - p-1 rounded hover:bg-white/10 buttons
 * - size={14} icons
 */

import { FolderUp, PanelLeftClose } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format directory path for display.
 * Shows the last 2 segments of the path for context.
 */
function formatDisplayPath(cwd: string): string {
  const normalized = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  if (segments.length === 1) {
    return segments[0];
  }

  return segments.slice(-2).join("/");
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

// ============================================================================
// Component
// ============================================================================

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
  const displayPath = formatDisplayPath(cwd);
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
          <button
            type="button"
            onClick={onToggleCollapse}
            className={buttonClass}
            title="Collapse tree"
            data-testid="collapse-toggle-button"
          >
            <PanelLeftClose size={14} />
          </button>
        )}

        {/* Current directory */}
        <span className="truncate" title={cwd} data-testid="current-directory">
          {displayPath}
        </span>
      </div>

      {/* Right side: navigate up button */}
      <div className="flex items-center gap-1 shrink-0">
        {canGoUp && (
          <button
            type="button"
            onClick={onNavigateUp}
            className={buttonClass}
            title="Go up one directory"
            data-testid="navigate-up-button"
          >
            <FolderUp size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
