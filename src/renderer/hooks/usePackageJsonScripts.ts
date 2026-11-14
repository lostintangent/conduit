import path from "path-browserify";
import { useEffect, useState } from "react";

interface PackageJsonScripts {
  [key: string]: string;
}

interface PackageJson {
  name?: string;
  scripts?: PackageJsonScripts;
}

/**
 * Hook to find and parse package.json in the current directory or parent directories
 * @param cwd - Current working directory
 * @returns Object containing scripts and the package.json path, or null if not found
 */
export function usePackageJsonScripts(cwd: string | null | undefined) {
  const [result, setResult] = useState<{
    scripts: PackageJsonScripts;
    packageJsonPath: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cwd) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function findAndParsePackageJson(startDir: string): Promise<void> {
      try {
        let currentDir = startDir;
        const root = path.parse(currentDir).root;

        // Search up to 10 levels or until we hit root
        for (let i = 0; i < 10; i++) {
          try {
            const packageJsonPath = path.join(currentDir, "package.json");

            // Try to read the file
            const content = await window.conduit.fs.readFile(
              currentDir,
              packageJsonPath,
            );
            const text = new TextDecoder().decode(content);
            const packageJson: PackageJson = JSON.parse(text);

            if (!cancelled && packageJson.scripts) {
              setResult({
                scripts: packageJson.scripts,
                packageJsonPath,
              });
              setLoading(false);
              return;
            }
          } catch {
            // File doesn't exist or can't be read, continue up the directory tree
          }

          // Check if we've reached the root
          if (currentDir === root) {
            break;
          }

          // Move up one directory
          const parentDir = path.dirname(currentDir);
          if (parentDir === currentDir) {
            // We've reached the top (safety check)
            break;
          }
          currentDir = parentDir;
        }

        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error finding package.json:", error);
        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
      }
    }

    setLoading(true);
    findAndParsePackageJson(cwd);

    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return { ...result, loading };
}
