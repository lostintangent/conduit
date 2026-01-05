/**
 * useCwdFileTracking - Track the currently open file per working directory
 *
 * Maintains a mapping of CWD -> file path, allowing the sidebar to restore
 * the previously open file when returning to a directory.
 *
 * @example
 * ```tsx
 * const { currentFile, setFile, clearFile } = useCwdFileTracking(effectiveCwd);
 *
 * // When a file is opened
 * setFile("/path/to/file.ts");
 *
 * // When file is closed
 * clearFile();
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface CwdFileTrackingResult {
  /** The currently tracked file for the active CWD, or undefined if none */
  currentFile: string | undefined;

  /** Set the current file for the active CWD */
  setFile: (file: string) => void;

  /** Clear the current file for the active CWD */
  clearFile: () => void;
}

/**
 * Hook for tracking which file is open per working directory.
 *
 * @param cwd - The current working directory to track files for
 * @returns Object with currentFile state and setFile/clearFile functions
 */
export function useCwdFileTracking(cwd: string): CwdFileTrackingResult {
  // Map of CWD -> file path, persisted across CWD changes within the session
  const cwdFilesRef = useRef<Record<string, string>>({});

  // Current file for the active CWD
  const [currentFile, setCurrentFile] = useState<string | undefined>(
    () => cwdFilesRef.current[cwd],
  );

  // Track previous CWD to detect changes
  const prevCwdRef = useRef(cwd);

  // Restore file when CWD changes
  useEffect(() => {
    if (prevCwdRef.current !== cwd) {
      setCurrentFile(cwdFilesRef.current[cwd]);
      prevCwdRef.current = cwd;
    }
  }, [cwd]);

  const setFile = useCallback(
    (file: string) => {
      setCurrentFile(file);
      cwdFilesRef.current[cwd] = file;
    },
    [cwd],
  );

  const clearFile = useCallback(() => {
    setCurrentFile(undefined);
    delete cwdFilesRef.current[cwd];
  }, [cwd]);

  return { currentFile, setFile, clearFile };
}
