import type { FileTreeNode, GitStatusMap } from "@shared/types";
import path from "path-browserify";
import { useMemo } from "react";
import { FileTreeItem } from "./FileTreeItem";
import { ResourceGroup } from "./ResourceGroup";

type FileTreeProps = {
  items: FileTreeNode[];
  gitStatus?: GitStatusMap | null;
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
  expandedPaths?: Set<string> | null;
  onManualExpansionToggle?: (path: string, isExpanded: boolean) => void;
  isFiltering?: boolean;
  showGroupedByStaging?: boolean;
  onStageFile?: (relativePath: string) => void;
  onUnstageFile?: (relativePath: string) => void;
  onRevertFile?: (relativePath: string) => void;
  showStagedView?: boolean; // Which status to show when file has both staged and unstaged
  selectedFilePath?: string | null; // Path of currently selected file for highlighting
  vmId?: string | "local"; // VM ID for file operations routing
};

export function FileTree({
  items,
  gitStatus,
  onFileSelect,
  onDirectoryChange,
  onFileOpen,
  rootPath,
  expandedPaths,
  onManualExpansionToggle,
  isFiltering,
  showGroupedByStaging = false,
  onStageFile,
  onUnstageFile,
  onRevertFile,
  showStagedView,
  selectedFilePath,
  vmId,
}: FileTreeProps) {
  // Group files by staged/unstaged when showGroupedByStaging is true
  const groupedItems = useMemo(() => {
    if (!showGroupedByStaging || !gitStatus) {
      return { all: items, staged: [], unstaged: [] };
    }

    // Helper to find a file in the tree recursively
    const findFileInTree = (
      nodes: FileTreeNode[],
      path: string,
    ): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.relativePath === path && node.type === "file") {
          return node;
        }
        if (node.type === "directory" && node.children) {
          const found = findFileInTree(node.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    // Helper to rebuild tree structure from flat file list
    const buildTreeFromFiles = (files: FileTreeNode[]): FileTreeNode[] => {
      const root: FileTreeNode[] = [];
      const dirMap = new Map<string, FileTreeNode>();

      for (const file of files) {
        const pathParts = file.relativePath.split("/");

        // Build directory nodes for the path
        let currentPath = "";
        let currentLevel = root;

        for (let i = 0; i < pathParts.length - 1; i++) {
          const dirName = pathParts[i];
          currentPath = currentPath ? `${currentPath}/${dirName}` : dirName;

          // Check if directory already exists at this level
          let dirNode = currentLevel.find(
            (n) => n.relativePath === currentPath && n.type === "directory",
          );

          if (!dirNode) {
            // Create new directory node
            dirNode = {
              type: "directory",
              name: dirName,
              path: path.join(rootPath, currentPath),
              relativePath: currentPath,
              children: [],
            };
            currentLevel.push(dirNode);
            dirMap.set(currentPath, dirNode);
          }

          currentLevel = dirNode.children!;
        }

        // Add the file to the deepest directory
        currentLevel.push(file);
      }

      return root;
    };

    // Collect files by their staging status
    const stagedFiles: FileTreeNode[] = [];
    const unstagedFiles: FileTreeNode[] = [];

    for (const [relativePath, status] of gitStatus.entries()) {
      const fileNode = findFileInTree(items, relativePath);

      // If we can't find the file in the tree, create a basic node for it
      const node: FileTreeNode =
        fileNode ||
        ({
          type: "file",
          name: relativePath.split("/").pop() || relativePath,
          path: path.join(rootPath, relativePath),
          relativePath: relativePath,
        } as FileTreeNode);

      // A file can appear in both staged and unstaged when it has both statuses
      // (e.g., "AD" = added in index, deleted in working tree)
      if (status.stagedStatus) {
        stagedFiles.push(node);
      }

      if (status.unstagedStatus) {
        unstagedFiles.push(node);
      }

      // Fallback to old behavior if stagedStatus/unstagedStatus not set
      if (!status.stagedStatus && !status.unstagedStatus) {
        if (status.staged) {
          stagedFiles.push(node);
        } else {
          unstagedFiles.push(node);
        }
      }
    }

    // Rebuild tree structure for each group
    const staged = buildTreeFromFiles(stagedFiles);
    const unstaged = buildTreeFromFiles(unstagedFiles);

    return { all: items, staged, unstaged };
  }, [items, gitStatus, showGroupedByStaging]);

  if (showGroupedByStaging && gitStatus) {
    const hasItems =
      groupedItems.staged.length > 0 || groupedItems.unstaged.length > 0;

    return (
      <nav className="text-sm text-white/80">
        {groupedItems.staged.length > 0 && (
          <ResourceGroup
            label="Staged Changes"
            count={groupedItems.staged.length}
          >
            <ul className="space-y-1">
              {groupedItems.staged.map((item) => (
                <FileTreeItem
                  key={item.relativePath || item.path}
                  node={item}
                  gitStatus={gitStatus}
                  onFileSelect={onFileSelect}
                  onDirectoryChange={onDirectoryChange}
                  onFileOpen={onFileOpen}
                  rootPath={rootPath}
                  expandedPaths={expandedPaths}
                  onManualExpansionToggle={onManualExpansionToggle}
                  isFiltering={isFiltering}
                  prefetch={item.type === "directory"}
                  onUnstageFile={onUnstageFile}
                  onRevertFile={onRevertFile}
                  showStagedView={true}
                  selectedFilePath={selectedFilePath}
                  vmId={vmId}
                />
              ))}
            </ul>
          </ResourceGroup>
        )}

        {groupedItems.unstaged.length > 0 && (
          <ResourceGroup label="Changes" count={groupedItems.unstaged.length}>
            <ul className="space-y-1">
              {groupedItems.unstaged.map((item) => (
                <FileTreeItem
                  key={item.relativePath || item.path}
                  node={item}
                  gitStatus={gitStatus}
                  onFileSelect={onFileSelect}
                  onDirectoryChange={onDirectoryChange}
                  onFileOpen={onFileOpen}
                  rootPath={rootPath}
                  expandedPaths={expandedPaths}
                  onManualExpansionToggle={onManualExpansionToggle}
                  isFiltering={isFiltering}
                  prefetch={item.type === "directory"}
                  onStageFile={onStageFile}
                  onRevertFile={onRevertFile}
                  showStagedView={false}
                  selectedFilePath={selectedFilePath}
                  vmId={vmId}
                />
              ))}
            </ul>
          </ResourceGroup>
        )}

        {!hasItems && items.length > 0 && (
          <div className="text-foreground/50 text-xs px-3 py-2">
            No files to display (items: {items.length}, check console for
            warnings)
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav className="text-sm text-white/80">
      <ul className="space-y-1">
        {items.map((item) => (
          <FileTreeItem
            key={item.relativePath || item.path}
            node={item}
            gitStatus={gitStatus}
            onFileSelect={onFileSelect}
            onDirectoryChange={onDirectoryChange}
            onFileOpen={onFileOpen}
            rootPath={rootPath}
            expandedPaths={expandedPaths}
            onManualExpansionToggle={onManualExpansionToggle}
            isFiltering={isFiltering}
            prefetch={item.type === "directory"}
            showStagedView={showStagedView}
            selectedFilePath={selectedFilePath}
            vmId={vmId}
          />
        ))}
      </ul>
    </nav>
  );
}
