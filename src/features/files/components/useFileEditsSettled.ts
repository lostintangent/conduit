import type { FileSystemSubscription } from "../client/FileSystemSubscription";
import { useEffect, useEffectEvent } from "react";

/** Debounce delay for file content changes, so a burst of writes settles once (ms) */
const FILE_EDIT_DEBOUNCE_MS = 300;

/**
 * Call `onSettled` once file content changes under `fs` settle. Editing a
 * file changes its line counts without changing its git status, so git
 * events don't report it.
 */
export function useFileEditsSettled(
  fs: FileSystemSubscription,
  enabled: boolean,
  onSettled: () => void,
): void {
  const settled = useEffectEvent(onSettled);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = fs.onAnyFileContentChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => settled(), FILE_EDIT_DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [fs, enabled]);
}
