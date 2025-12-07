/**
 * File search IPC handlers
 */

import { ipcMain } from "electron";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface FileSearchRequest {
  rootPath: string;
  query: string;
  maxResults?: number;
}

export interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
}

export interface ContentSearchRequest {
  rootPath: string;
  query: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

export interface ContentSearchResult {
  path: string;
  relativePath: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export function registerSearchHandlers(): void {
  ipcMain.handle(
    "search:files",
    async (_, request: FileSearchRequest): Promise<FileSearchResult[]> => {
      const { rootPath, query, maxResults = 100 } = request;
      const results: FileSearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      try {
        // Build find command with common exclusions
        const excludeDirs = [
          "node_modules",
          ".git",
          ".next",
          ".nuxt",
          "dist",
          "build",
          "out",
          ".cache",
          "__pycache__",
          ".pytest_cache",
          "vendor",
          "target",
          "coverage",
        ];

        // Build find command
        const pruneArgs = excludeDirs
          .map((dir) => `-path "*/${dir}" -prune`)
          .join(" -o ");
        const command = `find "${rootPath}" \\( ${pruneArgs} \\) -o -type f -iname "*${query}*" -print 2>/dev/null | head -n ${maxResults}`;

        console.log(`[FileSearch] Running: find in ${rootPath} for "${query}"`);

        // Execute directly
        const { stdout } = await execAsync(command, {
          maxBuffer: 1024 * 1024, // 1MB buffer
          timeout: 5000, // 5 second timeout
        });

        if (!stdout || stdout.trim() === "") {
          return results;
        }

        // Parse output
        const lines = stdout.trim().split("\n").slice(0, maxResults);

        for (const line of lines) {
          const fullPath = line.trim();
          if (!fullPath) continue;

          const parts = fullPath.split("/");
          const name = parts[parts.length - 1] || "";
          const relativePath = fullPath.replace(rootPath + "/", "");

          // Additional filtering
          if (name.toLowerCase().includes(lowerQuery)) {
            results.push({
              path: fullPath,
              name,
              relativePath,
            });
          }
        }

        console.log(`[FileSearch] Found ${results.length} results`);
        return results;
      } catch (error) {
        console.error("[FileSearch] Search failed:", error);
        return results;
      }
    },
  );

  ipcMain.handle(
    "search:content",
    async (
      _,
      request: ContentSearchRequest,
    ): Promise<ContentSearchResult[]> => {
      const {
        rootPath,
        query,
        caseSensitive = false,
        maxResults = 100,
      } = request;
      const results: ContentSearchResult[] = [];

      try {
        // Build grep command with common exclusions
        const excludeDirs = [
          "node_modules",
          ".git",
          ".next",
          ".nuxt",
          "dist",
          "build",
          "out",
          ".cache",
          "__pycache__",
          ".pytest_cache",
          "vendor",
          "target",
          "coverage",
          "test-results",
        ];

        const excludeArgs = excludeDirs
          .map((dir) => `--exclude-dir="${dir}"`)
          .join(" ");

        // Escape special characters in query for grep
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const caseFlag = caseSensitive ? "" : "-i";

        // Use grep with line numbers and context
        const command = `grep -r -n ${caseFlag} ${excludeArgs} --binary-files=without-match "${escapedQuery}" "${rootPath}" 2>/dev/null | head -n ${maxResults}`;

        console.log(
          `[ContentSearch] Running grep in ${rootPath} for "${query}" (caseSensitive: ${caseSensitive})`,
        );

        const { stdout } = await execAsync(command, {
          maxBuffer: 5 * 1024 * 1024, // 5MB buffer
          timeout: 10000, // 10 second timeout
        });

        if (!stdout || stdout.trim() === "") {
          return results;
        }

        // Parse grep output: path:line:content
        const lines = stdout.trim().split("\n").slice(0, maxResults);

        for (const line of lines) {
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (!match) continue;

          const [, fullPath, lineNumStr, content] = match;
          const lineNum = parseInt(lineNumStr, 10);
          const relativePath = fullPath.replace(rootPath + "/", "");

          // Find match position in content
          const searchContent = caseSensitive ? content : content.toLowerCase();
          const searchQuery = caseSensitive ? query : query.toLowerCase();
          const matchStart = searchContent.indexOf(searchQuery);
          const matchEnd = matchStart >= 0 ? matchStart + query.length : -1;

          results.push({
            path: fullPath,
            relativePath,
            line: lineNum,
            content: content.trim(),
            matchStart,
            matchEnd,
          });
        }

        console.log(`[ContentSearch] Found ${results.length} results`);
        return results;
      } catch (error) {
        console.error("[ContentSearch] Search failed:", error);
        return results;
      }
    },
  );
}
