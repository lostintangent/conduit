/**
 * useAutoOpenFile Hook
 *
 * Handles automatic file selection when an editor pane opens.
 * Encapsulates the logic for:
 * - Validating that an initial file path exists
 * - Auto-opening the most recently modified file if no valid file is specified
 *
 * This supports tab duplication scenarios where a file path is translated
 * to a new CWD but may not exist at that location.
 *
 * @example
 * ```tsx
 * useAutoOpenFile({
 *   initialFilePath: pane.file,
 *   selectedFile,
 *   setSelectedFile,
 *   cwd: currentCwd,
 *   fs,
 *   git,
 *   baseBranch,
 *   preferDiffForModified,
 *   setViewMode,
 * });
 * ```
 */

import { useEffect, useRef } from "react";
import type { GitV2API } from "@/api/GitV2API";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type { FileNode, ViewMode } from "../types";
import { selectNextAvailableFile } from "../utils/fileSelectionHelpers";

export interface UseAutoOpenFileOptions {
  /** Initial file path from pane config */
  initialFilePath: string | undefined;

  /** Current selected file state */
  selectedFile: FileNode | null;

  /** Setter for selected file state */
  setSelectedFile: (file: FileNode | null) => void;

  /** Current working directory */
  cwd: string;

  /** FileSystem API for checking file existence */
  fs: FileSystemV2API;

  /** Git API for finding recently modified files */
  git: GitV2API;

  /** Base branch for diff comparisons */
  baseBranch: string | null;

  /** Whether to prefer diff view for modified files */
  preferDiffForModified: boolean;

  /** Callback to set the view mode */
  setViewMode: (mode: ViewMode) => void;
}

/**
 * Hook for automatic file selection on editor pane mount.
 *
 * Logic:
 * 1. If an initial file path is provided, validate it exists
 * 2. If valid, keep that file as the selection
 * 3. If not valid (or no initial file), auto-open the most recently modified file
 */
export function useAutoOpenFile({
  initialFilePath,
  selectedFile,
  setSelectedFile,
  cwd,
  fs,
  git,
  baseBranch,
  preferDiffForModified,
  setViewMode,
}: UseAutoOpenFileOptions): void {
  // Track whether each step has been attempted (one-time execution)
  const autoOpenAttemptedRef = useRef(false);
  const initialFileValidatedRef = useRef(!initialFilePath); // true if no validation needed

  // Step 1: Validate initial file exists (if provided)
  useEffect(() => {
    if (initialFileValidatedRef.current) return;

    if (!initialFilePath || !selectedFile) {
      initialFileValidatedRef.current = true;
      return;
    }

    let cancelled = false;

    const validateInitialFile = async () => {
      try {
        const exists = await fs.exists(initialFilePath);
        if (cancelled) return;

        initialFileValidatedRef.current = true;
        if (!exists) {
          setSelectedFile(null); // Will trigger auto-open
        }
      } catch {
        // On error, assume file exists and let the editor handle it
        initialFileValidatedRef.current = true;
      }
    };

    validateInitialFile();
    return () => {
      cancelled = true;
    };
  }, [initialFilePath, selectedFile, fs, setSelectedFile]);

  // Step 2: Auto-open most recently modified file if no valid selection
  useEffect(() => {
    if (autoOpenAttemptedRef.current) return;
    if (!initialFileValidatedRef.current) return; // Wait for validation

    autoOpenAttemptedRef.current = true;

    // Don't auto-open if a file is already selected
    // Note: We only check selectedFile, not initialFilePath, because if initialFilePath
    // was provided but the file doesn't exist, validation will have cleared selectedFile
    if (selectedFile) return;

    let cancelled = false;

    const autoOpenFile = async () => {
      try {
        await git.whenReady();

        const { file, relativePath } = await selectNextAvailableFile(git, cwd, {
          fallbackToCommitted: true,
        });

        if (!file || !relativePath || cancelled) return;

        setSelectedFile(file);

        // Show diff view for modified files if user prefers
        const status = await git.getStatus();
        const fileStatus = status?.files.get(relativePath);
        if (fileStatus?.status === "modified" && preferDiffForModified) {
          setViewMode({
            type: "diff",
            filePath: file.path,
            baseBranch: baseBranch ?? undefined,
          });
        } else {
          setViewMode({ type: "editor" });
        }
      } catch (error) {
        console.debug("[useAutoOpenFile] Auto-open failed:", error);
      }
    };

    autoOpenFile();
    return () => {
      cancelled = true;
    };
  }, [
    selectedFile,
    cwd,
    git,
    baseBranch,
    preferDiffForModified,
    setViewMode,
    setSelectedFile,
  ]);
}
