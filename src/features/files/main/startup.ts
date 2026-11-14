import { unwatchAll } from "./ParcelFileWatcher";

/**
 * Every file watcher, including git's and dotfiles', stops before quit, since
 * an FSEvents callback that lands during teardown aborts the process.
 */
export default function startFiles() {
  return unwatchAll;
}
