import type { FileTreeNode, GitStatusMap } from "@shared/types";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderInput,
  FolderOpen,
  Loader2,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCallback, useMemo } from "react";
import { FileTreeItem } from "./FileTreeItem";
import { aggregateFolderStatus } from "./gitFolderAggregation";
import { useDirectoryCache } from "./useDirectoryCache";

type DirectoryItemProps = {
  node: FileTreeNode;
  gitStatus?: GitStatusMap | null;
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
  isExpanded: boolean;
  expandedPaths?: Set<string> | null;
  onManualExpansionToggle?: (path: string, isExpanded: boolean) => void;
  isFiltering?: boolean;
  prefetch?: boolean;
  onStageFile?: (relativePath: string) => void;
  onUnstageFile?: (relativePath: string) => void;
  onRevertFile?: (relativePath: string) => void;
};

export function DirectoryItem({
  node,
  gitStatus,
  onFileSelect,
  onDirectoryChange,
  onFileOpen,
  rootPath,
  isExpanded,
  expandedPaths,
  onManualExpansionToggle,
  isFiltering,
  prefetch = false,
  onStageFile,
  onUnstageFile,
  onRevertFile,
}: DirectoryItemProps) {
  // Check if children are already provided (e.g., from grouped staging view)
  // When showing staged/unstaged groups, the tree is pre-built with children populated
  const hasPrePopulatedChildren = node.children !== undefined;

  // Use custom hook for cache management only if children aren't pre-populated
  const cacheResult = useDirectoryCache({
    node,
    rootPath,
    isExpanded,
    prefetch,
    isFiltering,
    gitStatus,
  });

  // Use pre-populated children if available, otherwise use cache
  const children = hasPrePopulatedChildren
    ? node.children
    : cacheResult.children;
  const isLoading = hasPrePopulatedChildren ? false : cacheResult.isLoading;
  const loadChildren = cacheResult.loadChildren;
  const isResolved = hasPrePopulatedChildren ? true : cacheResult.isResolved;

  // Aggregate git status for this folder using VS Code's weight-based priority system
  const folderStatus = useMemo(
    () => aggregateFolderStatus(gitStatus, node.relativePath),
    [gitStatus, node.relativePath],
  );

  // Folders use normal foreground color (no git status coloring)
  const colorClass = "text-foreground";
  const iconColorClass = "text-foreground";

  const toggleOpen = useCallback(async () => {
    // Toggle the expansion state through the parent
    onManualExpansionToggle?.(node.relativePath, !isExpanded);

    // Load children if expanding and not already resolved
    // (This handles the click case; the useEffect in the hook handles prefetch)
    // Skip loading if children are pre-populated
    if (!isExpanded && !isResolved && !hasPrePopulatedChildren) {
      await loadChildren(true); // Show spinner for user-initiated expand
    }
  }, [
    isExpanded,
    isResolved,
    node.relativePath,
    onManualExpansionToggle,
    loadChildren,
    hasPrePopulatedChildren,
  ]);

  const handleChangeCwd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDirectoryChange?.(node.path);
    },
    [node.path, onDirectoryChange],
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleOpen();
      }
    },
    [toggleOpen],
  );

  const hasChildren = Array.isArray(children) && children.length > 0;
  const ArrowIcon = isExpanded ? ChevronDown : ChevronRight;
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={handleRowKeyDown}
        aria-expanded={isExpanded}
        className="group flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition hover:bg-foreground/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      >
        {isLoading ? (
          <Loader2 className="animate-spin" size={12} />
        ) : (
          <ArrowIcon className="text-foreground" size={12} />
        )}
        <FolderIcon className={`shrink-0 ${iconColorClass}`} size={12} />
        <span
          className={`min-w-0 flex-1 truncate ${colorClass}`}
          title={node.relativePath}
        >
          {node.name}
        </span>
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={handleChangeCwd}
            className="opacity-0 group-hover:opacity-100 p-1 group-hover:text-foreground rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            title="Change to this directory"
          >
            <FolderInput size={12} />
          </button>
          {folderStatus && (
            <div
              className="flex items-center justify-center"
              style={{ width: "16px", height: "16px" }}
            >
              <div
                className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${folderStatus.colorClass}`}
                title={folderStatus.label}
              />
            </div>
          )}
        </div>
      </div>
      {isExpanded && (
        <ul className="mt-0.5 border-l border-border pl-2">
          {isLoading ? (
            <li className="pl-4 text-xs text-foreground/50">Loading...</li>
          ) : hasChildren ? (
            children!.map((child) => (
              <FileTreeItem
                key={child.relativePath || child.path}
                node={child}
                gitStatus={gitStatus}
                onFileSelect={onFileSelect}
                onDirectoryChange={onDirectoryChange}
                onFileOpen={onFileOpen}
                rootPath={rootPath}
                expandedPaths={expandedPaths}
                onManualExpansionToggle={onManualExpansionToggle}
                isFiltering={isFiltering}
                prefetch={isExpanded && child.type === "directory"}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onRevertFile={onRevertFile}
              />
            ))
          ) : (
            <li className="pl-4 text-xs text-foreground/50">Empty directory</li>
          )}
        </ul>
      )}
    </li>
  );
}
