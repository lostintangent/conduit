/**
 * BranchSelector - Dialog for selecting a base branch for comparison.
 *
 * Unlike BranchSwitcher (which performs git checkout), this component
 * allows selecting a branch to compare the working tree against.
 *
 * Features:
 * - Dialog with searchable branch list
 * - Keyboard navigation (up/down/enter/escape)
 * - HEAD option for comparing uncommitted changes only
 * - Shows branch metadata (last commit date, message, current indicator)
 *
 * @example
 * ```tsx
 * <BranchSelector
 *   git={git}
 *   open={isOpen}
 *   currentBaseBranch={baseBranch}
 *   onSelectBranch={handleSelect}
 *   onOpenChange={setIsOpen}
 * />
 * ```
 */

import { clearPressedKeys } from "@/commands/keybindings/parser";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { GitBranch } from "lucide-react";
import type { GitV2API } from "@/api/GitV2API";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/utils/time";
import { useBranches, filterBranchesByQuery } from "./hooks/useBranches";

export interface BranchSelectorProps {
  /** Git API instance */
  git: GitV2API | null;

  /** Whether the dialog is open */
  open: boolean;

  /** Currently selected base branch (null = HEAD) */
  currentBaseBranch: string | null;

  /** Callback when a branch is selected */
  onSelectBranch: (branchName: string | null) => void;

  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for selecting a base branch for comparison mode.
 */
export function BranchSelector({
  git,
  open,
  currentBaseBranch,
  onSelectBranch,
  onOpenChange,
}: BranchSelectorProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch branches when dialog opens
  // Include remote branches for comparison (like GitHub PR view)
  const { branches, isLoading, error } = useBranches(git, {
    enabled: open,
    includeRemote: true,
    currentBranchFirst: false, // We'll handle sorting ourselves
  });

  // ---------------------------------------------------------------------------
  // Filtered Branches
  // ---------------------------------------------------------------------------

  const filteredBranches = useMemo(() => {
    return filterBranchesByQuery(branches, filter, {
      excludeHead: true,
      limit: 15,
    });
  }, [branches, filter]);

  // Total options = 1 (HEAD) + filtered branches
  const totalOptions = 1 + filteredBranches.length;

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Reset state when dialog closes
      setFilter("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selected && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearPressedKeys();
        onOpenChange(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalOptions);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex === 0) {
          // HEAD option selected
          onSelectBranch(null);
        } else {
          // Branch selected
          const branch = filteredBranches[selectedIndex - 1];
          if (branch) {
            onSelectBranch(branch.name);
          }
        }
      }
    },
    [
      onSelectBranch,
      onOpenChange,
      selectedIndex,
      totalOptions,
      filteredBranches,
    ],
  );

  const handleOptionClick = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      if (index === 0) {
        onSelectBranch(null);
      } else {
        const branch = filteredBranches[index - 1];
        if (branch) {
          onSelectBranch(branch.name);
        }
      }
    },
    [onSelectBranch, filteredBranches],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl w-full max-h-[600px] p-0 flex flex-col gap-0"
        onKeyDown={handleKeyDown}
        data-testid="branch-selector-dialog"
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border space-y-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-foreground/60" />
            Select Base Branch
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose a branch to compare your working tree against
          </DialogDescription>
        </DialogHeader>

        {/* Filter input */}
        <div className="px-4 py-3 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            placeholder="Filter branches..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-2 bg-elevated border border-border rounded text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/50"
            data-testid="branch-selector-filter"
          />
        </div>

        {/* Loading/Error states */}
        {isLoading ? (
          <div className="px-4 py-8 text-center text-foreground/60 text-sm">
            Loading branches...
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-destructive text-sm">
            {error}
          </div>
        ) : (
          <>
            {/* HEAD option - pinned at top */}
            <button
              data-index={0}
              onClick={() => handleOptionClick(0)}
              className={`w-full px-4 py-3 text-left border-b border-border transition-colors ${
                currentBaseBranch === null
                  ? "bg-accent/20 text-accent"
                  : selectedIndex === 0
                    ? "bg-elevated"
                    : "hover:bg-elevated"
              }`}
              data-testid="branch-selector-head"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">HEAD</span>
                    {currentBaseBranch === null && (
                      <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded">
                        comparing
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-foreground/60 mt-1">
                    Compare to working tree (uncommitted changes only)
                  </div>
                </div>
              </div>
            </button>

            {/* Branch list - scrollable */}
            <div ref={listRef} className="flex-1 overflow-y-auto">
              {filteredBranches.length > 0 ? (
                filteredBranches.map((branch, index) => {
                  const optionIndex = index + 1;
                  const isSelected = selectedIndex === optionIndex;
                  const isCurrentBase = currentBaseBranch === branch.name;

                  return (
                    <button
                      key={branch.name}
                      data-index={optionIndex}
                      onClick={() => handleOptionClick(optionIndex)}
                      className={`w-full px-4 py-3 text-left border-b border-border/50 transition-colors ${
                        isCurrentBase
                          ? "bg-accent/20 text-accent"
                          : isSelected
                            ? "bg-elevated"
                            : "hover:bg-elevated"
                      }`}
                      data-testid={`branch-selector-option-${branch.name}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium text-sm truncate">
                              {branch.name}
                            </span>
                            {branch.isRemote && (
                              <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded flex-shrink-0">
                                remote
                              </span>
                            )}
                            {branch.isCurrent && (
                              <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                                current
                              </span>
                            )}
                            {isCurrentBase && (
                              <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded flex-shrink-0">
                                comparing
                              </span>
                            )}
                          </div>
                          {branch.lastCommitDate && (
                            <div className="text-xs text-foreground/40 flex-shrink-0">
                              {`${formatRelativeTime(new Date(branch.lastCommitDate).getTime() / 1000)} ago`}
                            </div>
                          )}
                        </div>
                        {branch.lastCommitMessage && (
                          <div className="text-xs text-foreground/60 truncate">
                            {branch.lastCommitMessage}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-foreground/60 text-sm">
                  {filter
                    ? `No branches found matching "${filter}"`
                    : "No branches found"}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
