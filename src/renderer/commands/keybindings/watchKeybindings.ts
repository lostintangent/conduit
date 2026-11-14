/**
 * Get the parent directory of a file path.
 * Used to determine the cwd for fs operations.
 */
function getParentDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : "/";
}

/**
 * Watch keybindings file for changes using fs subscription API
 */
export function watchKeybindingsFile(
  filePath: string,
  onChanged: () => void,
): () => void {
  if (!window.conduit?.files?.subscribe) {
    console.warn("window.conduit.files.subscribe is not available");
    return () => {};
  }

  let subscriptionId: string | null = null;
  let ipcCleanup: (() => void) | null = null;

  const cwd = getParentDirectory(filePath);

  window.conduit.files
    .subscribe(cwd, filePath)
    .then((subId) => {
      subscriptionId = subId;
      ipcCleanup = window.conduit.files.on("fileContentChanged", (payload) => {
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
      window.conduit?.files?.unsubscribe?.(subscriptionId);
    }
  };
}
