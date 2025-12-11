/**
 * ChangesSection - Collapsible section for staged or unstaged files.
 *
 * Displays a group of changed files with:
 * - Collapsible section header with count
 * - Bulk action button (Stage all / Unstage all)
 * - List of FileChangeDiff components
 *
 * @example
 * ```tsx
 * <ChangesSection
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

import { ChevronDown, ChevronRight } from "lucide-react";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import type { GitV2API } from "@/api/GitV2API";
import { cn } from "@/utils";
import { FileChangeDiff } from "./FileChangeDiff";

export interface ChangesSectionProps {
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

  // Props passed through to FileChangeDiff
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
}

/**
 * Collapsible section for a group of changed files.
 */
export function ChangesSection({
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
}: ChangesSectionProps) {
  if (files.length === 0) {
    return null;
  }

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
        </button>

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
          {files.map(([path, status]) => (
            <FileChangeDiff
              key={path}
              filePath={path}
              cwd={cwd}
              git={git}
              status={status}
              baseBranch={baseBranch}
              isExpanded={expandedFiles.has(path)}
              onToggle={() => onToggleFile(path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
