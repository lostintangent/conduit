import type { FileTreeNode, GitStatusMap } from "@shared/types";
import { DirectoryItem } from "./DirectoryItem";
import { FileItem } from "./FileItem";

type FileTreeItemProps = {
  node: FileTreeNode;
  gitStatus?: GitStatusMap | null;
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
  expandedPaths?: Set<string> | null;
  onManualExpansionToggle?: (path: string, isExpanded: boolean) => void;
  isFiltering?: boolean;
  prefetch?: boolean;
  onStageFile?: (relativePath: string) => void;
  onUnstageFile?: (relativePath: string) => void;
  onRevertFile?: (relativePath: string) => void;
  showStagedView?: boolean;
  selectedFilePath?: string | null;
  sessionId?: string;
};

export function FileTreeItem({
  node,
  gitStatus,
  onFileSelect,
  onDirectoryChange,
  onFileOpen,
  rootPath,
  expandedPaths,
  onManualExpansionToggle,
  isFiltering,
  prefetch,
  onStageFile,
  onUnstageFile,
  onRevertFile,
  showStagedView,
  selectedFilePath,
  sessionId,
}: FileTreeItemProps) {
  const isDirectory = node.type === "directory";
  if (isDirectory) {
    return (
      <DirectoryItem
        node={node}
        gitStatus={gitStatus}
        onFileSelect={onFileSelect}
        onDirectoryChange={onDirectoryChange}
        onFileOpen={onFileOpen}
        rootPath={rootPath}
        isExpanded={expandedPaths?.has(node.relativePath) || false}
        expandedPaths={expandedPaths}
        onManualExpansionToggle={onManualExpansionToggle}
        isFiltering={isFiltering}
        prefetch={prefetch}
        onStageFile={onStageFile}
        onUnstageFile={onUnstageFile}
        onRevertFile={onRevertFile}
        showStagedView={showStagedView}
        selectedFilePath={selectedFilePath}
        sessionId={sessionId}
      />
    );
  }

  // Extract specific file status from map
  let fileStatus = gitStatus?.get(node.relativePath);

  // If file has both staged and unstaged status, construct the appropriate view
  if (fileStatus && showStagedView !== undefined) {
    if (showStagedView && fileStatus.stagedStatus) {
      // Show staged status
      fileStatus = {
        ...fileStatus,
        status: fileStatus.stagedStatus,
        staged: true,
      };
    } else if (!showStagedView && fileStatus.unstagedStatus) {
      // Show unstaged status
      fileStatus = {
        ...fileStatus,
        status: fileStatus.unstagedStatus,
        staged: false,
      };
    }
  }

  return (
    <FileItem
      node={node}
      gitStatus={fileStatus}
      onSelect={onFileSelect}
      onOpen={onFileOpen}
      onStageFile={onStageFile}
      onUnstageFile={onUnstageFile}
      onRevertFile={onRevertFile}
      selectedFilePath={selectedFilePath}
    />
  );
}
