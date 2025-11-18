import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileTreeNode } from "../../shared/types";

type IgnorePredicate = (fullPath: string) => Promise<boolean>;

function getGitRoot(startPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--show-toplevel"], {
      cwd: startPath,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.once("error", () => resolve(null));
    child.once("close", (code) => {
      if (code === 0) {
        resolve(output.trim() === "" ? null : output.trim());
        return;
      }
      resolve(null);
    });
  });
}

function isGitIgnored(gitRoot: string, relativePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const normalizedRelative =
      relativePath === "" || relativePath === "." ? "." : relativePath;

    const child = spawn("git", ["check-ignore", "-q", normalizedRelative], {
      cwd: gitRoot,
      stdio: ["ignore", "ignore", "ignore"],
    });

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

async function createIgnorePredicate(
  startPath: string,
): Promise<IgnorePredicate> {
  const gitRoot = await getGitRoot(startPath);
  if (!gitRoot) {
    return async () => false;
  }

  const cache = new Map<string, boolean>();

  return async (fullPath: string) => {
    const normalized = path.normalize(fullPath);
    if (cache.has(normalized)) {
      return cache.get(normalized) ?? false;
    }

    const relative = path.relative(gitRoot, normalized);
    if (relative.startsWith("..")) {
      cache.set(normalized, false);
      return false;
    }

    const gitPath = relative.split(path.sep).join("/");
    const ignored = await isGitIgnored(gitRoot, gitPath);
    cache.set(normalized, ignored);
    return ignored;
  };
}

async function readDirectory(
  rootPath: string,
  targetPath: string,
  shouldIgnore: IgnorePredicate,
): Promise<FileTreeNode[]> {
  let dirEntries: Dirent[];
  try {
    dirEntries = await fs.readdir(targetPath, { withFileTypes: true });
  } catch (error: any) {
    console.error(
      `[FS] Failed to read directory "${targetPath}":`,
      error.code || error.message || error,
    );
    throw error;
  }

  const nodes: FileTreeNode[] = [];

  for (const entry of dirEntries) {
    const fullPath = path.join(targetPath, entry.name);
    const normalizedFullPath = path.normalize(fullPath);
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    if (await shouldIgnore(normalizedFullPath)) {
      continue;
    }

    const relativePath = path
      .relative(rootPath, normalizedFullPath)
      .split(path.sep)
      .join("/");

    if (entry.isSymbolicLink()) {
      nodes.push({
        name: entry.name,
        path: normalizedFullPath,
        relativePath,
        type: "file",
      });
      continue;
    }

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: normalizedFullPath,
        relativePath,
        type: "directory",
      });
      continue;
    }

    nodes.push({
      name: entry.name,
      path: normalizedFullPath,
      relativePath,
      type: "file",
    });
  }

  nodes.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    return a.type === "directory" ? -1 : 1;
  });

  return nodes;
}

/**
 * Lists the contents of a directory and returns file tree nodes.
 *
 * @param directoryPath - The absolute path of the directory to list (the target directory whose contents to read)
 * @param rootPath - Optional. The absolute path of the root directory, used as the base for computing
 *                   relative paths in FileTreeNode.relativePath. If not provided, directoryPath is used as the root.
 *
 * @returns Array of FileTreeNode objects representing the directory contents
 *
 * @example
 * // List root directory - relativePath will be computed from /Users/foo/project
 * await listDirectory('/Users/foo/project')
 * // Returns: [{ name: 'src', path: '/Users/foo/project/src', relativePath: 'src', ... }]
 *
 * @example
 * // List nested directory - relativePath still computed from editor root
 * await listDirectory('/Users/foo/project/src/components', '/Users/foo/project')
 * // Returns: [{ name: 'Button.tsx', path: '/Users/foo/project/src/components/Button.tsx',
 * //            relativePath: 'src/components/Button.tsx', ... }]
 *
 * @remarks
 * The rootPath parameter is critical for git status integration. Git status keys are paths
 * relative to the repository root (e.g., "src/components/Button.tsx"). When directories are lazily
 * loaded (expanded), we must compute relativePath from the same root to ensure paths match git status keys.
 * Without this, nested files won't show git status indicators.
 */
export async function listDirectory(
  directoryPath: string,
  rootPath?: string,
): Promise<FileTreeNode[]> {
  const targetPath = path.resolve(directoryPath);
  const resolvedRootPath = rootPath ? path.resolve(rootPath) : targetPath;
  const shouldIgnore = await createIgnorePredicate(resolvedRootPath);
  return readDirectory(resolvedRootPath, targetPath, shouldIgnore);
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
