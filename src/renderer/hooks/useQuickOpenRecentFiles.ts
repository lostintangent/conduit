import { atom, useAtom } from "jotai";

// Define atom (could also go in atoms.ts)
const quickOpenRecentFilesAtom = atom<string[]>([]);

export function useQuickOpenRecentFiles() {
  const [recentFiles, setRecentFiles] = useAtom(quickOpenRecentFilesAtom);

  return {
    recentFiles,

    addRecentFile: (filePath: string) => {
      setRecentFiles((prev) => {
        // Remove if exists, add to front (LRU)
        const updated = [filePath, ...prev.filter((f) => f !== filePath)];
        // Keep only last 20
        return updated.slice(0, 20);
      });
    },

    removeRecentFile: (filePath: string) => {
      setRecentFiles((prev) => prev.filter((f) => f !== filePath));
    },

    setRecentFiles: (files: string[]) => {
      setRecentFiles(files.slice(-20));
    },
  };
}
