import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Branch } from "@shared/types";
import { formatDistanceToNow } from "date-fns";
import { GitBranch } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BranchSelectorProps = {
  open: boolean;
  branches: Branch[];
  currentBaseBranch: string | null;
  onSelectBranch: (branchName: string | null) => void;
  onOpenChange: (open: boolean) => void;
};

export function BranchSelector({
  open,
  branches,
  currentBaseBranch,
  onSelectBranch,
  onOpenChange,
}: BranchSelectorProps) {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter branches by search term (limit to 15 for performance)
  // Exclude HEAD from the list since it's shown as a special option
  const filteredBranches = useMemo(() => {
    const query = filter.toLowerCase();
    return branches
      .filter(
        (b) =>
          b.name.toLowerCase() !== "head" &&
          b.name.toLowerCase().includes(query),
      )
      .slice(0, 15);
  }, [branches, filter]);

  // Total options = 1 (HEAD) + filtered branches
  const totalOptions = 1 + filteredBranches.length;

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure dialog is fully rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
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
    [onSelectBranch, selectedIndex, totalOptions, filteredBranches],
  );

  // Scroll selected item into view
  useEffect(() => {
    const selected = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selected) {
      selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl w-full max-h-[600px] p-0 flex flex-col gap-0"
        onKeyDown={handleKeyDown}
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
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedIndex(0); // Reset selection when filter changes
            }}
            className="w-full px-3 py-2 bg-elevated border border-border rounded text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

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
          {/* Filtered branches */}
          {filteredBranches.length > 0 ? (
            filteredBranches.map((branch, index) => {
              const optionIndex = index + 1;
              const isSelected = selectedIndex === optionIndex;
              const isCurrent = currentBaseBranch === branch.name;

              return (
                <button
                  key={branch.name}
                  data-index={optionIndex}
                  onClick={() => handleOptionClick(optionIndex)}
                  className={`w-full px-4 py-3 text-left border-b border-border/50 transition-colors ${
                    isCurrent
                      ? "bg-accent/20 text-accent"
                      : isSelected
                        ? "bg-elevated"
                        : "hover:bg-elevated"
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-medium text-sm truncate">
                          {branch.name}
                        </span>
                        {branch.isCurrent && (
                          <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                            current
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded flex-shrink-0">
                            comparing
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-foreground/40 flex-shrink-0">
                        {formatDistanceToNow(new Date(branch.lastCommitDate), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                    <div className="text-xs text-foreground/60 truncate">
                      {branch.lastCommitMessage}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-foreground/60 text-sm">
              No branches found matching "{filter}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
