/**
 * TypeScript configuration file (tsconfig.json) resolution
 * Mimics VS Code's behavior of searching within workspace boundaries
 */

export interface FileSystemApi {
  fileExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
}

/**
 * Finds the project root by looking for common project indicators
 * This is used to limit the tsconfig search scope (similar to VS Code's workspace root)
 */
export async function findProjectRoot(
  startDir: string,
  api: FileSystemApi,
): Promise<string | null> {
  let currentDir = startDir;

  // Detect path separator based on drive letter or UNC path
  // Don't just check for backslash anywhere (could be mixed separators)
  const isWindows = /^[A-Z]:/i.test(currentDir) || /^\\\\/.test(currentDir);
  const sep = isWindows ? "\\" : "/";
  currentDir = currentDir.replace(/[\/\\]/g, sep);

  let previousDir = "";
  const maxLevelsUp = 10; // Reasonable limit to prevent going too far up
  let levelsUp = 0;

  // Look for common project root indicators
  const projectIndicators = [".git", "package.json", ".vscode", ".idea"];

  while (currentDir !== previousDir && levelsUp < maxLevelsUp) {
    // Check for project indicators
    for (const indicator of projectIndicators) {
      const indicatorPath = `${currentDir}${sep}${indicator}`;
      try {
        const exists = await api.fileExists(indicatorPath);
        if (exists) {
          console.log(
            "[Monaco TypeScript] Found project root at:",
            currentDir,
            "(indicator:",
            indicator + ")",
          );
          return currentDir;
        }
      } catch (error) {
        // Continue checking other indicators
      }
    }

    // Move up one directory
    previousDir = currentDir;
    const parts = currentDir.split(sep).filter(Boolean);

    if (parts.length === 0) break;

    parts.pop();
    levelsUp++;

    // Reconstruct path
    if (isWindows) {
      if (parts.length === 1 && /^[A-Z]:$/i.test(parts[0])) {
        // Windows root (e.g., "C:")
        currentDir = parts[0] + sep;
      } else if (parts.length === 0) {
        // Reached Windows root
        break;
      } else {
        // Windows path (e.g., "C:\Users\project")
        currentDir = parts.join(sep);
      }
    } else {
      if (parts.length === 0) {
        // Unix root
        currentDir = sep;
      } else {
        // Unix path (always starts with /)
        currentDir = sep + parts.join(sep);
      }
    }
  }

  // If no project root found, use the start directory as the boundary
  console.log("[Monaco TypeScript] No project root found, using:", startDir);
  return startDir;
}

/**
 * Searches for tsconfig.json starting from the given directory and walking up to project root
 * This mimics VS Code's behavior of searching within the workspace folder
 * Supports both Unix and Windows paths
 */
export async function findTsConfig(
  startDir: string,
  api: FileSystemApi,
): Promise<string | null> {
  // First find the project root to limit our search
  const projectRoot = await findProjectRoot(startDir, api);
  if (!projectRoot) {
    return null;
  }

  let currentDir = startDir;

  // Detect path separator based on drive letter or UNC path
  // Don't just check for backslash anywhere (could be mixed separators)
  const isWindows = /^[A-Z]:/i.test(currentDir) || /^\\\\/.test(currentDir);
  const sep = isWindows ? "\\" : "/";
  currentDir = currentDir.replace(/[\/\\]/g, sep);

  const normalizedProjectRoot = projectRoot.replace(/[\/\\]/g, sep);
  let previousDir = "";

  // Search from startDir up to projectRoot (like VS Code searches within workspace)
  while (currentDir !== previousDir) {
    // Don't add separator if currentDir already ends with one
    const needsSep = !currentDir.endsWith(sep);
    const tsconfigPath = `${currentDir}${needsSep ? sep : ""}tsconfig.json`;

    try {
      const exists = await api.fileExists(tsconfigPath);
      if (exists) {
        console.log(
          "[Monaco TypeScript] Found tsconfig.json at:",
          tsconfigPath,
        );
        return tsconfigPath;
      }
    } catch (error) {
      // Continue searching if file check fails
    }

    // Stop if we've reached the project root
    if (currentDir === normalizedProjectRoot) {
      break;
    }

    // Move up one directory
    previousDir = currentDir;
    const parts = currentDir.split(sep).filter(Boolean);

    if (parts.length === 0) break;

    parts.pop();

    // Reconstruct path
    if (isWindows) {
      if (parts.length === 1 && /^[A-Z]:$/i.test(parts[0])) {
        // Windows root (e.g., "C:")
        currentDir = parts[0] + sep;
      } else if (parts.length === 0) {
        // Reached Windows root
        break;
      } else {
        // Windows path (e.g., "C:\Users\project")
        currentDir = parts.join(sep);
      }
    } else {
      if (parts.length === 0) {
        // Unix root
        currentDir = sep;
      } else {
        // Unix path (always starts with /)
        currentDir = sep + parts.join(sep);
      }
    }

    // Double-check we haven't gone above project root
    // If currentDir is not within the project root tree, we've gone too far
    if (
      !currentDir.startsWith(normalizedProjectRoot) &&
      currentDir !== normalizedProjectRoot
    ) {
      break;
    }
  }

  console.log(
    "[Monaco TypeScript] No tsconfig.json found starting from:",
    startDir,
    "up to project root:",
    projectRoot,
  );
  return null;
}

/**
 * Parses tsconfig.json content and extracts compiler options
 * Throws an error if the JSON is invalid
 */
export function parseTsConfig(content: string): any {
  try {
    const tsconfig = JSON.parse(content);
    return tsconfig.compilerOptions || {};
  } catch (error) {
    console.error("[Monaco TypeScript] Failed to parse tsconfig.json:", error);
    throw error; // Re-throw so caller can handle it
  }
}
