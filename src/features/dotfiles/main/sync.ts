/**
 * Bidirectional sync between local dotfiles repo and remote.
 * Handles file watching (local → remote) and polling (remote → local).
 */

import type { SimpleGit } from "simple-git";
import type { DotfilesStatus } from "../model";
import { ParcelFileWatcher } from "@features/files/main/ParcelFileWatcher";
import { commitAndPush, fetchAndPull } from "./git";
import { syncSymlink } from "./symlinks";

let watcher: ParcelFileWatcher | null = null;
let pollingInterval: NodeJS.Timeout | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let isProcessingChange = false;
let pendingChange = false;

const POLLING_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEBOUNCE_MS = 60000; // 1 minute

// ============================================================================
// Sync Control
// ============================================================================

/**
 * Starts bidirectional sync: file watching (local → remote) and polling (remote → local).
 */
export async function startSync(
  repoPath: string,
  homeDirectory: string,
  git: SimpleGit,
  getStatus: () => DotfilesStatus,
  updateStatus: (status: DotfilesStatus) => void,
): Promise<void> {
  // Start file watching
  if (watcher) {
    await watcher.dispose();
  }

  watcher = new ParcelFileWatcher(repoPath, {
    ignored: ["**/.git/**"],
  });

  const scheduleCommit = () => scheduleGitCommit(git, updateStatus);

  watcher.onCreated((e) => {
    syncSymlink(repoPath, homeDirectory, e.path);
    scheduleCommit();
  });

  watcher.onDeleted((e) => {
    syncSymlink(repoPath, homeDirectory, e.path, true);
    scheduleCommit();
  });

  watcher.onRenamed((e) => {
    syncSymlink(repoPath, homeDirectory, e.oldPath, true);
    syncSymlink(repoPath, homeDirectory, e.newPath);
    scheduleCommit();
  });

  watcher.onModified(() => scheduleCommit());

  await watcher.watch();

  // Start polling for remote changes
  startPolling(repoPath, homeDirectory, git, getStatus, updateStatus);
}

/**
 * Stops bidirectional sync.
 */
export async function stopSync(): Promise<void> {
  stopPolling();

  if (watcher) {
    await watcher.dispose();
    watcher = null;
  }
}

// ============================================================================
// Polling (internal)
// ============================================================================

/**
 * Starts polling for remote changes.
 */
function startPolling(
  repoPath: string,
  homeDirectory: string,
  git: SimpleGit,
  status: () => DotfilesStatus,
  updateStatus: (status: DotfilesStatus) => void,
): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  pollingInterval = setInterval(() => {
    fetchAndPull(git, status(), updateStatus, repoPath, homeDirectory);
  }, POLLING_INTERVAL_MS);
}

/**
 * Stops polling for remote changes.
 */
function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ============================================================================
// Git Sync Scheduling
// ============================================================================

/**
 * Schedules a git commit with debouncing.
 */
function scheduleGitCommit(
  git: SimpleGit,
  updateStatus: (status: DotfilesStatus) => void,
): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    await processGitSync(git, updateStatus);
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Processes pending git changes.
 */
async function processGitSync(
  git: SimpleGit,
  updateStatus: (status: DotfilesStatus) => void,
): Promise<void> {
  if (isProcessingChange) {
    pendingChange = true;
    return;
  }

  isProcessingChange = true;
  pendingChange = false;

  try {
    await commitAndPush(git, updateStatus);
  } finally {
    isProcessingChange = false;
    if (pendingChange) {
      scheduleGitCommit(git, updateStatus);
    }
  }
}
