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
      />
    );
  }

  // Extract specific file status from map
  const fileStatus = gitStatus?.get(node.relativePath);

  return (
    <FileItem
      node={node}
      gitStatus={fileStatus}
      onSelect={onFileSelect}
      onOpen={onFileOpen}
    />
  );
}
