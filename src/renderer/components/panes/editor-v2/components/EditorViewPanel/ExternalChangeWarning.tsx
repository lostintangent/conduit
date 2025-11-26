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
 * @example
 * ```tsx
 * <ExternalChangeWarning
 *   filePath="/path/to/file.ts"
 *   isOrphaned={false}
 *   hasExternalChanges={true}
 *   isDirty={true}
 *   onReload={() => registry.reloadModel(uri)}
 *   onKeepChanges={() => setDismissed(true)}
 *   onSave={() => registry.saveModel(uri)}
 * />
 * ```
 */

import { AlertTriangle, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  filePath,
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

  // Get filename for display
  const fileName = filePath.split("/").pop() ?? filePath;

  // Determine warning type and message
  const isConflict = hasExternalChanges && isDirty;

  let title: string;
  let message: string;

  if (isOrphaned) {
    title = "File Deleted";
    message = `"${fileName}" has been deleted. Save to recreate the file, or close the editor to discard your changes.`;
  } else if (isConflict) {
    title = "External Changes Detected";
    message = `"${fileName}" has been modified externally. Reload to see external changes (discards your changes), or keep your changes and save to overwrite.`;
  } else {
    // hasExternalChanges but not dirty - this shouldn't show a warning
    // because the file should have auto-reloaded
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 bg-warning/10 border-b border-warning/30 text-sm"
      role="alert"
      data-testid="external-change-warning"
    >
      {/* Warning icon */}
      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />

      {/* Message */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-warning">{title}:</span>{" "}
        <span className="text-foreground/80">{message}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Reload button - show for conflicts */}
        {isConflict && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            className="h-7 text-xs"
            data-testid="warning-reload-button"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Reload
          </Button>
        )}

        {/* Save button - show for orphaned or conflicts */}
        {(isOrphaned || isConflict) && isDirty && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            className="h-7 text-xs"
            data-testid="warning-save-button"
          >
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
        )}

        {/* Dismiss button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onKeepChanges}
          className="h-7 text-xs"
          title="Keep my changes"
          data-testid="warning-dismiss-button"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
