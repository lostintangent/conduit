/**
 * PanelViewPortToggle - Floating toggle for narrow viewport layouts.
 *
 * When the editor pane is too narrow for split view (based on container width,
 * not window size), this component provides a floating toggle to switch between
 * file tree and editor views.
 *
 * @example
 * ```tsx
 * <PanelViewPortToggle
 *   activeView="editor"
 *   onViewChange={(view) => setActiveView(view)}
 * />
 * ```
 */

import { FolderTree, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

// ============================================================================
// Types
// ============================================================================

/**
 * The current active view in single-column layout mode.
 */
export type PanelView = "tree" | "editor";

export interface PanelViewPortToggleProps {
  /** Currently active view */
  activeView: PanelView;

  /** Callback when view is changed */
  onViewChange: (view: PanelView) => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Floating toggle buttons for switching between tree and editor views.
 *
 * Positioned at the bottom center of the container. Only rendered when
 * the pane is in single-column layout mode (narrow viewport).
 */
export function PanelViewPortToggle({
  activeView,
  onViewChange,
}: PanelViewPortToggleProps) {
  return (
    <div
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-1 p-1",
        "bg-background/95 backdrop-blur-sm",
        "border border-border rounded-lg shadow-lg",
      )}
      data-testid="panel-viewport-toggle"
    >
      <Button
        variant={activeView === "tree" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 px-3 gap-2"
        onClick={() => onViewChange("tree")}
        title="File Explorer"
        data-testid="panel-toggle-tree"
      >
        <FolderTree className="h-4 w-4" />
        <span className="text-xs">Files</span>
      </Button>

      <Button
        variant={activeView === "editor" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 px-3 gap-2"
        onClick={() => onViewChange("editor")}
        title="Editor"
        data-testid="panel-toggle-editor"
      >
        <Code className="h-4 w-4" />
        <span className="text-xs">Editor</span>
      </Button>
    </div>
  );
}
