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
  } catch {
    return [];
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

export async function listDirectory(cwd: string): Promise<FileTreeNode[]> {
  const rootPath = path.resolve(cwd);
  const shouldIgnore = await createIgnorePredicate(rootPath);
  return readDirectory(rootPath, rootPath, shouldIgnore);
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
