/**
 * useDiffContent Hook
 *
 * Provides the original and modified content for a diff view. The original
 * content comes from git (HEAD or a specified branch), while the modified
 * content comes from the current working directory via the Monaco model.
 *
 * @example
 * ```tsx
 * function DiffEditor({ filePath, baseBranch, cwd }: Props) {
 *   const diff = useDiffContent(filePath, baseBranch, cwd);
 *
 *   if (diff.isLoading) return <Loading />;
 *   if (diff.error) return <Error message={diff.error} />;
 *
 *   return (
 *     <MonacoDiffEditor
 *       original={diff.original}
 *       modified={diff.modified}
 *     />
 *   );
 * }
 * ```
 */

import { useEffect, useState, useRef } from "react";
import { useGitV2 } from "../../../../hooks/useGitV2";
import { MonacoModelRegistry, pathToUri } from "../registry";

/**
 * Result returned by useDiffContent hook.
 */
export interface DiffContent {
  /** Original content from git (HEAD or baseBranch) */
  original: string | null;

  /** Modified content from working directory */
  modified: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Error message if loading failed */
  error: string | null;
}

/**
 * Hook to get diff content for a file.
 *
 * Fetches the original content from git and the modified content from
 * the MonacoModelRegistry. Handles loading states and errors gracefully.
 *
 * @param filePath - Absolute path to the file, or null for no content
 * @param baseBranch - Git ref for original content (default: 'HEAD')
 * @param cwd - Working directory for git operations
 * @returns DiffContent with original, modified, loading state, and error
 */
export function useDiffContent(
  filePath: string | null,
  baseBranch: string | undefined,
  cwd: string,
): DiffContent {
  const [state, setState] = useState<DiffContent>({
    original: null,
    modified: null,
    isLoading: filePath !== null,
    error: null,
  });

  // Git API for fetching original content
  const git = useGitV2(cwd);

  // Track mounted state to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // If no file path, reset state
    if (filePath === null) {
      setState({
        original: null,
        modified: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Start loading
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const loadContent = async () => {
      try {
        const registry = MonacoModelRegistry.getInstance();
        const uri = pathToUri(filePath);

        // Fetch original content from git
        const ref = baseBranch || "HEAD";
        const originalContent = await git.getFileAtRef(filePath, ref);

        // Get modified content from model registry
        // The model should already exist if we're showing a diff for it
        const modelState = registry.getModelState(uri);
        let modifiedContent: string | null = null;

        if (modelState !== null) {
          // Model exists - get content from it
          const model = registry.getModel(uri);
          modifiedContent = model?.getValue() ?? null;
        } else {
          // Model doesn't exist - try to create it
          try {
            const model = await registry.getOrCreateModel(filePath, cwd);
            modifiedContent = model.getValue();
          } catch {
            // If we can't read the file, it might be a new untracked file
            // In that case, modified will be null
            modifiedContent = null;
          }
        }

        // Only update state if still mounted and filePath hasn't changed
        if (isMountedRef.current) {
          setState({
            original: originalContent,
            modified: modifiedContent,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to load diff content";

        if (isMountedRef.current) {
          setState({
            original: null,
            modified: null,
            isLoading: false,
            error: errorMessage,
          });
        }
      }
    };

    loadContent();
  }, [filePath, baseBranch, cwd, git]);

  return state;
}
