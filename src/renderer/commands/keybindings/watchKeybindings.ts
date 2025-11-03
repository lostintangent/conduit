/**
 * Watch keybindings file for changes
 */
export function watchKeybindingsFile(
  filePath: string,
  onChanged: () => void,
): () => void {
  // Use fs.watch in Electron
  const watcher = window.conduit?.watchFile?.(filePath, () => {
    console.log("Keybindings file changed, reloading...");
    onChanged();
  });

  return () => {
    watcher?.dispose();
  };
}
