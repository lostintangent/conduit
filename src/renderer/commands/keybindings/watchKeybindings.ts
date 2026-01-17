/**
 * Get the parent directory of a file path.
 * Used to determine the cwd for fsv2 operations.
 */
function getParentDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : "/";
}

/**
 * Watch keybindings file for changes using fsv2 subscription API
 */
export function watchKeybindingsFile(
  filePath: string,
  onChanged: () => void,
): () => void {
  if (!window.conduit?.fsv2?.subscribe) {
    console.warn("window.conduit.fsv2.subscribe is not available");
    return () => {};
  }

  let subscriptionId: string | null = null;
  let ipcCleanup: (() => void) | null = null;

  const cwd = getParentDirectory(filePath);

  window.conduit.fsv2
    .subscribe(cwd, "file", filePath)
    .then((subId) => {
      subscriptionId = subId;
      ipcCleanup = window.conduit.fsv2.onFileContentChanged((payload) => {
        if (payload.subscriptionId !== subscriptionId) return;
        console.log("Keybindings file changed, reloading...");
        onChanged();
      });
    })
    .catch((error) => {
      console.error("Failed to watch keybindings file:", error);
    });

  return () => {
    ipcCleanup?.();
    if (subscriptionId) {
      window.conduit?.fsv2?.unsubscribe?.(subscriptionId);
    }
  };
}
