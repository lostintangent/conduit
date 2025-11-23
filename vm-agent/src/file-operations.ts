import { promises as fs } from "node:fs";
import path from "node:path";

export interface FileTreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  size?: number;
  modified?: Date;
}

/**
 * Read a file and return its contents
 */
export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf8");
}

/**
 * Write content to a file
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file statistics
 */
export async function getFileStats(filePath: string): Promise<{
  mtime: number;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
}> {
  const stats = await fs.stat(filePath);
  return {
    mtime: stats.mtime.getTime(),
    size: stats.size,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
  };
}

/**
 * List directory contents recursively
 */
export async function listDirectory(
  directoryPath: string,
  rootPath?: string,
): Promise<FileTreeNode[]> {
  const root = rootPath || directoryPath;
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    const stats = await fs.stat(fullPath);

    // Compute relative path from root (needed for git status lookup)
    const relativePath = path.relative(root, fullPath);

    const node: FileTreeNode = {
      name: entry.name,
      path: fullPath,
      relativePath,
      type: entry.isDirectory() ? "directory" : "file",
      size: stats.size,
      modified: stats.mtime,
    };

    if (entry.isDirectory()) {
      try {
        node.children = await listDirectory(fullPath, root);
      } catch (error) {
        console.error(`Failed to read directory ${fullPath}:`, error);
        node.children = [];
      }
    }

    nodes.push(node);
  }

  return nodes.sort((a, b) => {
    // Directories first, then alphabetical
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
