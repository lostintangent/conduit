/**
 * FileTreeToolbar - Header toolbar for the file tree with navigation and controls.
 *
 * Provides:
 * - Current directory display (last 2 path segments, full path in tooltip)
 * - Navigate up button (disabled at filesystem root)
 * - Collapse toggle button (only in split layout mode)
 *
 * @example
 * ```tsx
 * <FileTreeToolbar
 *   cwd="/Users/dev/project/src"
 *   canNavigateUp={true}
 *   onNavigateUp={handleNavigateUp}
 *   isCollapsed={false}
 *   onToggleCollapse={handleToggle}
 *   showCollapseButton={true}
 * />
 * ```
 */

import { FolderUp, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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
 *
 * @example
 * formatDisplayPath("/Users/dev/project/src/components")
 * // Returns "src/components"
 *
 * formatDisplayPath("/Users/dev/project")
 * // Returns "project"
 */
function formatDisplayPath(cwd: string): string {
  // Remove trailing slash if present
  const normalized = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;

  // Split into segments
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  if (segments.length === 1) {
    return segments[0];
  }

  // Return last 2 segments
  return segments.slice(-2).join("/");
}

/**
 * Check if a path is at the filesystem root.
 */
function isAtRoot(cwd: string): boolean {
  // Normalize the path
  const normalized = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;

  // Unix root
  if (normalized === "" || normalized === "/") {
    return true;
  }

  // Windows root (e.g., "C:" or "C:\")
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

  // Disable navigate up if at root or explicitly disabled
  const canGoUp = canNavigateUp && !isRoot;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30"
      data-testid="file-tree-toolbar"
    >
      {/* Navigate Up Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={onNavigateUp}
        disabled={!canGoUp}
        title={canGoUp ? "Navigate to parent directory" : "Already at root"}
        data-testid="navigate-up-button"
      >
        <FolderUp className="h-4 w-4" />
      </Button>

      {/* Current Directory Display */}
      <span
        className="flex-1 text-xs text-foreground/80 truncate min-w-0"
        title={cwd}
        data-testid="current-directory"
      >
        {displayPath}
      </span>

      {/* Collapse Toggle Button (split mode only) */}
      {showCollapseButton && onToggleCollapse && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          data-testid="collapse-toggle-button"
        >
          {isCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}
