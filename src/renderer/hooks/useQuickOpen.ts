import { useCallback, useEffect, useRef, useState } from "react";
import { QuickOpenAPI } from "@/api/QuickOpenAPI";
import { filterFiles, type FileMatch } from "@/utils/quickOpenFiltering";
import { useQuickOpenRecentFiles } from "./useQuickOpenRecentFiles";

/**
 * useQuickOpen - Main hook for Quick Open functionality
 * Follows V2 pattern: hook encapsulates ALL logic, component just uses it
 */
export function useQuickOpen(cwd: string) {
  // State
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileList, setFileList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Recent files
  const recentFiles = useQuickOpenRecentFiles();

  // API instance
  const apiRef = useRef<QuickOpenAPI | null>(null);

  // Initialize API and load cache
  useEffect(() => {
    const api = new QuickOpenAPI(cwd);
    apiRef.current = api;

    // Load pre-warmed cache
    setIsLoading(true);
    api
      .getPreWarmedCache()
      .then((files) => {
        console.log(`[useQuickOpen] Loaded ${files.length} files from cache`);
        setFileList(files);
      })
      .catch((error) => {
        console.error("[useQuickOpen] Failed to load cache:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [cwd]);

  // Filter files when query or file list changes
  useEffect(() => {
    if (!visible) return;

    const timeoutId = setTimeout(() => {
      // If no files yet, show only recent files
      const filesToFilter =
        fileList.length > 0 ? fileList : recentFiles.recentFiles;

      const filtered = filterFiles(query, filesToFilter, {
        recentFiles: new Set(recentFiles.recentFiles),
        workspaceRoot: cwd,
        maxResults: 1000,
      });

      setResults(filtered);
      setActiveIndex(0);
    }, 50); // 50ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, fileList, visible, recentFiles.recentFiles, cwd]);

  // Open handler
  const open = useCallback(() => {
    setVisible(true);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Close handler
  const close = useCallback(() => {
    setVisible(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Select handler
  const handleSelect = useCallback(
    (file: FileMatch) => {
      recentFiles.addRecentFile(file.absolutePath);
      close();
    },
    [recentFiles, close],
  );

  return {
    // State
    visible,
    query,
    results,
    activeIndex,
    isLoading,

    // Setters
    setQuery,
    setActiveIndex,

    // Actions
    open,
    close,
    onSelect: handleSelect,
  };
}
