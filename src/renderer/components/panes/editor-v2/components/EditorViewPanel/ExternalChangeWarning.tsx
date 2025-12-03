/**
 * ExternalChangeWarning - Warning banner for external file changes.
 *
 * Displays a dismissible warning banner when:
 * - File has been deleted externally (orphaned)
 * - File has been modified externally while user has unsaved changes (conflict)
 *
 * Provides action buttons for the user to:
 * - Reload: Discard local changes and reload from disk
 * - Keep My Changes: Dismiss warning and keep local changes
 * - Save: Save local changes to disk (useful for deleted files)
 *
 * Styling matches v1 EditorPane warning banner.
 */

import { X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ============================================================================
// Types
// ============================================================================

export interface ExternalChangeWarningProps {
  /** Path to the file (for display) */
  filePath: string;

  /** File was deleted externally */
  isOrphaned: boolean;

  /** File was modified externally while dirty */
  hasExternalChanges: boolean;

  /** File has unsaved local changes */
  isDirty: boolean;

  /** Handler to reload file from disk */
  onReload: () => void;

  /** Handler to keep local changes and dismiss warning */
  onKeepChanges: () => void;

  /** Handler to save local changes to disk */
  onSave: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Warning banner for external file changes.
 *
 * Only renders when there's something to warn about:
 * - Orphaned files (deleted externally)
 * - Conflict state (external changes while dirty)
 */
export function ExternalChangeWarning({
  isOrphaned,
  hasExternalChanges,
  isDirty,
  onReload,
  onKeepChanges,
  onSave,
}: ExternalChangeWarningProps) {
  // Don't render if nothing to warn about
  if (!isOrphaned && !hasExternalChanges) {
    return null;
  }

  // Determine warning type
  const isConflict = hasExternalChanges && isDirty;

  // If has external changes but not dirty, don't show warning (file auto-reloads)
  if (!isOrphaned && !isConflict) {
    return null;
  }

  return (
    <div
      className="bg-warning border-b border-warning-border px-3 py-1.5 relative"
      role="alert"
      data-testid="external-change-warning"
    >
      {/* Dismiss button - absolute positioned top right */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onKeepChanges}
            className="absolute top-1.5 right-2 p-1 rounded hover:bg-white/20 text-warning-foreground transition-colors"
            data-testid="warning-dismiss-button"
          >
            <X size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Dismiss warning</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-2 text-[13px] pr-8">
        {/* Message */}
        <div className="flex items-center gap-2 text-warning-foreground">
          {isOrphaned ? (
            <span>
              This file was deleted externally. Your unsaved changes will be
              lost unless you save to recreate the file.
            </span>
          ) : (
            <span>This file was modified externally.</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Reload button - show for conflicts (not deleted) */}
          {!isOrphaned && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onReload}
                  className="px-3 py-1 text-xs rounded bg-warning-button hover:bg-warning-button-hover text-white transition-colors"
                  data-testid="warning-reload-button"
                >
                  Reload from disk
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Discard your changes and reload the file from disk
              </TooltipContent>
            </Tooltip>
          )}

          {/* Save/Keep button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onSave}
                className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                data-testid="warning-save-button"
              >
                {isOrphaned ? "Save anyway" : "Keep my changes"}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isOrphaned
                ? "Save your changes and recreate the deleted file"
                : "Keep your changes and dismiss the warning"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
