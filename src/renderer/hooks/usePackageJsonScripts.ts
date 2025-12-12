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
 * @param sandboxId - Optional sandbox ID for remote filesystem operations
 * @returns Object containing scripts and the package.json path, or null if not found
 */
export function usePackageJsonScripts(
  cwd: string | undefined,
  sandboxId?: string,
) {
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
    let retryCount = 0;
    const maxRetries = sandboxId ? 5 : 0; // Only retry for VMs (sandbox may not be connected yet)
    const retryDelay = 2000; // 2 seconds between retries

    async function findAndParsePackageJson(): Promise<boolean> {
      try {
        let currentDir = cwd;
        const root = path.parse(currentDir).root;

        // Search up to 10 levels or until we hit root
        for (let i = 0; i < 10; i++) {
          try {
            const packageJsonPath = path.join(currentDir, "package.json");

            // Try to read the file
            // Pass currentDir as cwd, packageJsonPath as the file to read, and sandboxId for VMs
            const content = await window.conduit.fsv2.readFile(
              currentDir,
              packageJsonPath,
              sandboxId,
            );
            const text = new TextDecoder().decode(content);
            const packageJson: PackageJson = JSON.parse(text);

            if (!cancelled && packageJson.scripts) {
              setResult({
                scripts: packageJson.scripts,
                packageJsonPath,
              });
              setLoading(false);
              return true; // Success
            }
          } catch (err) {
            // For VMs, check if the error is due to sandbox not being connected
            // In that case, we'll retry later
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            if (sandboxId && errorMessage.includes("sandbox connection")) {
              // Sandbox not connected yet - signal to retry
              return false;
            }
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
        return true; // Completed (even if no result found)
      } catch (error) {
        console.error("Error finding package.json:", error);
        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
        return true; // Don't retry on general errors
      }
    }

    async function attemptWithRetry() {
      setLoading(true);

      while (!cancelled && retryCount <= maxRetries) {
        const success = await findAndParsePackageJson();
        if (success || cancelled) {
          break;
        }

        // Wait before retrying (for VM sandbox connection)
        retryCount++;
        if (retryCount <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    attemptWithRetry();

    return () => {
      cancelled = true;
    };
  }, [cwd, sandboxId]);

  return { ...result, loading };
}
