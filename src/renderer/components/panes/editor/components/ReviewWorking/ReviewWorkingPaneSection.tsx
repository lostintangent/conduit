/**
 * ReviewWorkingPaneSection - Collapsible section for staged or unstaged files.
 *
 * Displays a group of changed files with:
 * - Collapsible section header with count
 * - Bulk action button (Stage all / Unstage all)
 * - List of ReviewWorkingPaneFile components
 *
 * @example
 * ```tsx
 * <ReviewWorkingPaneSection
 *   title="Staged Changes"
 *   files={stagedFiles}
 *   icon={<Check className="w-4 h-4" />}
 *   iconColorClass="text-green-500"
 *   isExpanded={stagedExpanded}
 *   onToggle={() => setStagedExpanded(!stagedExpanded)}
 *   bulkActionLabel="Unstage all"
 *   onBulkAction={handleUnstageAll}
 *   cwd={cwd}
 *   git={git}
 *   expandedFiles={expandedFiles}
 *   onToggleFile={toggleFile}
 * />
 * ```
 */

import type { GitFileStatus } from "@features/git/model";
import type { GitV2API } from "@features/git/client/GitV2API";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/utils";
import { Asterisk, ChevronDown, ChevronRight } from "lucide-react";
import { FileEditor } from "../shared";

export interface ReviewWorkingPaneSectionProps {
  /** Section title (e.g., "Staged Changes", "Changes") */
  title: string;

  /** List of files with their git status */
  files: Array<[string, GitFileStatus]>;

  /** Icon to display in section header */
  icon: React.ReactNode;

  /** Tailwind color class for the icon (e.g., "text-green-500") */
  iconColorClass: string;

  /** Whether the section is expanded */
  isExpanded: boolean;

  /** Callback to toggle section expansion */
  onToggle: () => void;

  /** Label for the bulk action button */
  bulkActionLabel: string;

  /** Callback for bulk action (stage all / unstage all) */
  onBulkAction: () => void;

  /** Whether bulk action is in progress */
  isBulkActionLoading?: boolean;

  // Props passed through to ReviewWorkingPaneFile
  /** Working directory */
  cwd: string;

  /** Git API instance */
  git: GitV2API;

  /** Git ref for diff comparison */
  baseBranch?: string;

  /** Set of expanded file paths */
  expandedFiles: Set<string>;

  /** Callback to toggle individual file expansion */
  onToggleFile: (path: string) => void;

  /** Callback to expand all files in this section */
  onExpandAll?: () => void;

  /** Callback to collapse all files in this section */
  onCollapseAll?: () => void;

  // ---------------------------------------------------------------------------
  // Follow Mode Props (optional)
  // ---------------------------------------------------------------------------

  /** Count of unseen files in this section (for header indicator) */
  unseenCount?: number;

  /** Check if a file is unseen */
  isFileUnseen?: (path: string) => boolean;

  /** Get timestamp for a file */
  getFileTimestamp?: (path: string) => number | null;

  /** Mark a file as seen (unseen tracking) */
  markSeen?: (path: string) => void;

  // ---------------------------------------------------------------------------
  // Dirty File Checking
  // ---------------------------------------------------------------------------

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;
}

/**
 * Collapsible section for a group of changed files.
 */
export function ReviewWorkingPaneSection({
  title,
  files,
  icon,
  iconColorClass,
  isExpanded,
  onToggle,
  bulkActionLabel,
  onBulkAction,
  isBulkActionLoading = false,
  cwd,
  git,
  baseBranch,
  expandedFiles,
  onToggleFile,
  onExpandAll,
  onCollapseAll,
  // Follow mode props
  unseenCount = 0,
  isFileUnseen,
  getFileTimestamp,
  markSeen,
  // Dirty file checking
  isFileDirty,
}: ReviewWorkingPaneSectionProps) {
  if (files.length === 0) {
    return null;
  }

  // Determine if all files in this section are expanded
  const allFilesExpanded = files.every(([path]) => expandedFiles.has(path));
  const hasExpandCollapseHandlers = onExpandAll && onCollapseAll;

  return (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      {/* Section Header */}
      <div
        className={cn(
          "flex items-center gap-2 w-full py-1 px-3",
          "bg-elevated hover:bg-elevated/80 transition-colors",
          "border-b border-border",
        )}
      >
        {/* Clickable expand/collapse area */}
        <button
          className="flex items-center gap-2 flex-1 text-[13px] font-medium text-left"
          onClick={onToggle}
          data-testid="section-toggle"
        >
          {isExpanded ? (
            <ChevronDown className="text-foreground flex-shrink-0" size={12} />
          ) : (
            <ChevronRight className="text-foreground flex-shrink-0" size={12} />
          )}
          <span className={iconColorClass}>{icon}</span>
          <span>{title}</span>
          <span className="text-muted-foreground">({files.length})</span>
          {/* Unseen indicator for section (Follow mode) */}
          {unseenCount > 0 && (
            <Asterisk
              className="text-yellow-500 flex-shrink-0"
              size={12}
              data-testid="section-unseen-indicator"
            />
          )}
        </button>

        {/* Expand/Collapse all button */}
        {hasExpandCollapseHandlers && (
          <>
            <button
              onClick={allFilesExpanded ? onCollapseAll : onExpandAll}
              className={cn(
                "text-xs text-muted-foreground hover:text-foreground transition-colors",
              )}
              data-testid="expand-collapse-button"
            >
              {allFilesExpanded ? "Collapse all" : "Expand all"}
            </button>
            <Separator orientation="vertical" className="h-4" />
          </>
        )}

        {/* Bulk action button */}
        <button
          onClick={onBulkAction}
          disabled={isBulkActionLoading}
          className={cn(
            "text-xs text-muted-foreground hover:text-foreground transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          data-testid="bulk-action-button"
        >
          {isBulkActionLoading ? "Working..." : bulkActionLabel}
        </button>
      </div>

      {/* File list (visible when expanded) */}
      {isExpanded && (
        <div>
          {files.map(([mapKey, status]) => (
            <FileEditor
              key={mapKey}
              layout="inline"
              context="working"
              filePath={status.path}
              cwd={cwd}
              git={git}
              status={status}
              baseBranch={baseBranch}
              isExpanded={expandedFiles.has(mapKey)}
              onToggle={() => onToggleFile(mapKey)}
              // Follow mode props
              isUnseen={isFileUnseen?.(status.path)}
              timestamp={getFileTimestamp?.(status.path)}
              markSeen={markSeen}
              // Dirty file checking
              isFileDirty={isFileDirty}
            />
          ))}
        </div>
      )}
    </div>
  );
}
