import { fuzzyScore, createMatches, type IMatch } from "./fuzzy-matcher";
import path from "path-browserify";

export interface FileMatch {
  absolutePath: string;
  relativePath: string;
  displayPath: string;
  filename: string;
  directory: string;
  score: number;
  highlights: IMatch[];
  isRecent: boolean;
}

export interface FilterOptions {
  maxResults?: number;
  recentFileBoost?: number;
  currentDirectoryBoost?: number;
  recentFiles?: Set<string>;
  currentDirectory?: string | null;
  workspaceRoot?: string;
}

/**
 * Filter and score files based on fuzzy query
 * Pure function - no side effects
 */
export function filterFiles(
  query: string,
  files: string[],
  options: FilterOptions = {},
): FileMatch[] {
  const {
    maxResults = 1000,
    recentFileBoost = 2.0,
    currentDirectoryBoost = 1.3,
    recentFiles = new Set(),
    currentDirectory = null,
    workspaceRoot = process.cwd(),
  } = options;

  // Empty query: return recent files first, then all files
  if (!query || query.trim().length === 0) {
    return getDefaultResults(files, maxResults, recentFiles, workspaceRoot);
  }

  const queryLower = query.toLowerCase();
  const results: FileMatch[] = [];
  const maxFilesToProcess = 50000;
  const filesToProcess = files.slice(0, maxFilesToProcess);

  for (const filePath of filesToProcess) {
    const relativePath = getRelativePath(filePath, workspaceRoot);
    const filename = path.basename(filePath);
    const directory = path.dirname(filePath);

    let bestScore = 0;
    let bestMatches: IMatch[] = [];

    // Try exact substring match first (highest priority)
    const filenameLower = filename.toLowerCase();
    const relativePathLower = relativePath.toLowerCase();

    if (filenameLower.includes(queryLower)) {
      const matchStart = filenameLower.indexOf(queryLower);
      bestScore = 10000;
      bestMatches = [
        {
          start: matchStart,
          end: matchStart + query.length,
        },
      ];

      if (matchStart === 0) bestScore *= 1.5;
      if (filenameLower === queryLower) bestScore *= 2;
    } else if (relativePathLower.includes(queryLower)) {
      bestScore = 5000;
      const filenameScore = fuzzyScore(
        query,
        queryLower,
        0,
        filename,
        filenameLower,
        0,
      );
      if (filenameScore) {
        bestMatches = createMatches(filenameScore);
      }
    } else {
      // Fuzzy matching
      const filenameScore = fuzzyScore(
        query,
        queryLower,
        0,
        filename,
        filenameLower,
        0,
      );
      if (filenameScore) {
        bestScore = filenameScore[0] * 2; // Boost filename matches
        bestMatches = createMatches(filenameScore);
      }

      const pathScore = fuzzyScore(
        query,
        queryLower,
        0,
        relativePath,
        relativePathLower,
        0,
      );
      if (pathScore && pathScore[0] > bestScore) {
        bestScore = pathScore[0];
        bestMatches = createMatches(pathScore);
      }
    }

    if (bestScore === 0) continue;

    // Apply boosts
    const isRecent = recentFiles.has(filePath);
    if (isRecent) bestScore *= recentFileBoost;
    if (currentDirectory && filePath.startsWith(currentDirectory)) {
      bestScore *= currentDirectoryBoost;
    }

    // Penalties
    const pathDepth = relativePath.split("/").length;
    bestScore -= relativePath.length * 0.0005;
    bestScore -= pathDepth * 0.01;
    bestScore -= filename.length * 0.0001;

    results.push({
      absolutePath: filePath,
      relativePath,
      displayPath: formatDisplayPath(filePath),
      filename,
      directory,
      score: bestScore,
      highlights: bestMatches,
      isRecent,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

function getDefaultResults(
  files: string[],
  maxResults: number,
  recentFiles: Set<string>,
  workspaceRoot: string,
): FileMatch[] {
  const results: FileMatch[] = [];
  const recentArray = Array.from(recentFiles);

  // Recent files first
  for (const filePath of recentArray) {
    if (files.includes(filePath)) {
      const relativePath = getRelativePath(filePath, workspaceRoot);
      results.push({
        absolutePath: filePath,
        relativePath,
        displayPath: formatDisplayPath(filePath),
        filename: path.basename(filePath),
        directory: path.dirname(filePath),
        score: 1000,
        highlights: [],
        isRecent: true,
      });
    }
  }

  // Remaining files
  const remainingSlots = maxResults - results.length;
  if (remainingSlots > 0) {
    for (const filePath of files) {
      if (!recentFiles.has(filePath)) {
        const relativePath = getRelativePath(filePath, workspaceRoot);
        results.push({
          absolutePath: filePath,
          relativePath,
          displayPath: formatDisplayPath(filePath),
          filename: path.basename(filePath),
          directory: path.dirname(filePath),
          score: 0,
          highlights: [],
          isRecent: false,
        });
        if (results.length >= maxResults) break;
      }
    }
  }

  return results;
}

function getRelativePath(filePath: string, rootPath: string): string {
  const relative = path.relative(rootPath, filePath);
  if (relative.startsWith("..")) return filePath;
  return relative;
}

function formatDisplayPath(filePath: string): string {
  const homePatterns = ["/Users/", "/home/"];
  for (const pattern of homePatterns) {
    if (filePath.startsWith(pattern)) {
      const afterPattern = filePath.slice(pattern.length);
      const firstSlash = afterPattern.indexOf("/");
      if (firstSlash > 0) {
        return "~" + afterPattern.slice(firstSlash);
      }
    }
  }
  return filePath;
}

/**
 * Get workspace root by finding .git directory
 */
export async function getWorkspaceRoot(startPath?: string): Promise<string> {
  // For now, simple implementation
  // TODO: Walk up to find .git directory using FileSystemV2API
  return startPath || process.cwd();
}
