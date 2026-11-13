/**
 * Quick Open File Filtering using fuzzy scoring
 *
 * This file uses a complete fuzzy scoring implementation to provide
 * intelligent file search with match highlighting.
 */

import path from "path-browserify";
import {
  compareItemsByFuzzyScore,
  prepareQuery,
  scoreItemFuzzy,
  type FuzzyScorerCache,
  type IItemAccessor,
  type IMatch,
} from "./fuzzy-matcher";

export interface FileMatch {
  absolutePath: string;
  relativePath: string;
  displayPath: string;
  filename: string;
  directory: string;
  score: number;
  highlights: IMatch[]; // Highlights for filename
  directoryHighlights: IMatch[]; // Highlights for directory path
  isRecent: boolean;
}

export interface FilterOptions {
  maxResults?: number;
  recentFiles?: Set<string>;
  currentDirectory?: string | null;
  workspaceRoot?: string;
}

/**
 * Accessor for FileMatch to work with VS Code's scorer
 * This maps our file data structure to the IItemAccessor interface
 */
class FileMatchAccessor implements IItemAccessor<FileMatch> {
  getItemLabel(item: FileMatch): string {
    return item.filename;
  }

  getItemDescription(item: FileMatch): string | undefined {
    // Use the directory as description (VS Code does this for files)
    const dir = path.dirname(item.relativePath);
    return dir === "." ? undefined : dir;
  }

  getItemPath(item: FileMatch): string | undefined {
    return item.absolutePath;
  }
}

const fileMatchAccessor = new FileMatchAccessor();

/**
 * Filter and score files based on fuzzy query using VS Code's exact algorithm
 */
export function filterFiles(
  query: string,
  files: string[],
  options: FilterOptions = {},
): FileMatch[] {
  const {
    maxResults = 1000,
    recentFiles = new Set(),
    _currentDirectory = null,
    workspaceRoot = "", // Default to empty string (caller should always provide this)
  } = options;

  // Empty query: return recent files first, then all files
  if (!query || query.trim().length === 0) {
    return getDefaultResults(files, maxResults, recentFiles, workspaceRoot);
  }

  // Prepare query using VS Code's preparation (handles spaces, wildcards, path separators, etc.)
  const preparedQuery = prepareQuery(query);

  // Convert file paths to FileMatch objects
  const fileMatches: FileMatch[] = files.map((filePath) => {
    const relativePath = getRelativePath(filePath, workspaceRoot);
    const filename = path.basename(filePath);
    const directory = path.dirname(filePath);
    const isRecent = recentFiles.has(filePath);

    return {
      absolutePath: filePath,
      relativePath,
      displayPath: formatDisplayPath(filePath),
      filename,
      directory,
      score: 0, // Will be computed by VS Code scorer
      highlights: [],
      directoryHighlights: [],
      isRecent,
    };
  });

  // Score all files using VS Code's scorer
  const cache: FuzzyScorerCache = Object.create(null);
  const scoredFiles: FileMatch[] = [];

  for (const fileMatch of fileMatches) {
    const itemScore = scoreItemFuzzy(
      fileMatch,
      preparedQuery,
      true, // allowNonContiguousMatches
      fileMatchAccessor,
      cache,
    );

    if (itemScore.score > 0) {
      // Extract highlights from the score
      fileMatch.score = itemScore.score;
      fileMatch.highlights = itemScore.labelMatch || [];
      fileMatch.directoryHighlights = itemScore.descriptionMatch || [];

      scoredFiles.push(fileMatch);
    }
  }

  // Separate recent and non-recent matches
  const recentMatches = scoredFiles.filter((f) => f.isRecent);
  const nonRecentMatches = scoredFiles.filter((f) => !f.isRecent);

  // Sort each group independently using VS Code's comparison function
  const sortFiles = (files: FileMatch[]) =>
    files.sort((a, b) =>
      compareItemsByFuzzyScore(
        a,
        b,
        preparedQuery,
        true, // allowNonContiguousMatches
        fileMatchAccessor,
        cache,
      ),
    );

  sortFiles(recentMatches);
  sortFiles(nonRecentMatches);

  // Recent files first, then non-recent files
  const sortedResults = [...recentMatches, ...nonRecentMatches];

  return sortedResults.slice(0, maxResults);
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
        directoryHighlights: [],
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
          directoryHighlights: [],
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
