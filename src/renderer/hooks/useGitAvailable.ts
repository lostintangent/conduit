/**
 * React Hook for checking Git availability
 *
 * Checks once on mount whether git is installed and accessible on the system.
 * Returns a loading state while checking, then the availability result.
 *
 * @example
 * ```tsx
 * function GitFeatures() {
 *   const { isAvailable, isLoading } = useGitAvailable();
 *
 *   if (isLoading) {
 *     return <div>Checking git availability...</div>;
 *   }
 *
 *   if (!isAvailable) {
 *     return <div>Git is not installed. Please install git to use this feature.</div>;
 *   }
 *
 *   return <GitStatusPanel />;
 * }
 * ```
 */

import { useState, useEffect } from "react";
import { GitV2API } from "../api/GitV2API";

/**
 * Result of the useGitAvailable hook.
 */
export interface UseGitAvailableResult {
  /** Whether git is available on the system */
  isAvailable: boolean;

  /** True while checking git availability */
  isLoading: boolean;
}

/**
 * Hook to check if git is available on the system.
 *
 * Performs a one-time check on mount. The result is cached on the main
 * process side, so subsequent calls are fast.
 *
 * @returns Object with isAvailable and isLoading states
 */
export function useGitAvailable(): UseGitAvailableResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkGitAvailability() {
      try {
        const available = await GitV2API.isGitAvailable();
        if (!cancelled) {
          setIsAvailable(available);
          setIsLoading(false);
        }
      } catch (error) {
        console.error(
          "[useGitAvailable] Error checking git availability:",
          error,
        );
        if (!cancelled) {
          setIsAvailable(false);
          setIsLoading(false);
        }
      }
    }

    checkGitAvailability();

    return () => {
      cancelled = true;
    };
  }, []);

  return { isAvailable, isLoading };
}
