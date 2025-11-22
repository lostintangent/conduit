/**
 * VM File Watcher Service
 *
 * Manages file watching subscriptions for cloud VM environments.
 * Implements IFileSystemWatcher and IGitWatcher interfaces to ensure
 * API parity with local FileWatcherService.
 */

import type { GitFileStatus, GitStatusMap } from "@shared/types";
import { BrowserWindow } from "electron";
import path from "node:path";
import type {
  FileChangedEvent,
  FileRenamedEvent,
  TreeChangedEvent,
} from "../../../../vm-agent/dist/protocol";
import type { CloudEnvironment } from "../../terminal/types";
import type { VMAgentClient } from "../../vm/agent-client";
import type { IFileSystemWatcher } from "./IFileSystemWatcher";
import type { IGitWatcher } from "./IGitWatcher";
import type { GitStatusChangedEvent } from "./types";

type VMSubscription = {
  paneId: string;
  windowId: number;
  cwd: string;
};

type VMWatchEntry = {
  vmId: string;
  cloudEnv: CloudEnvironment;
  subscriptions: Set<VMSubscription>;
  watchedPaths: Set<string>;
  gitStatusByPath: Map<string, Record<string, unknown> | null>;
  currentBranchByPath: Map<string, string | null>;
  baseBranchByPath: Map<string, string | null>;
  gitRefreshTimers: Map<string, NodeJS.Timeout>;
  // Batching fields (matching local FileWatcherService)
  gitStatusBatchTimers: Map<string, NodeJS.Timeout>;
  pendingGitStatusFiles: Map<string, Set<string>>;
};

/**
 * Service to manage VM file watcher subscriptions.
 * Implements IFileSystemWatcher and IGitWatcher interfaces to ensure
 * feature parity with local FileWatcherService.
 */
export class VMFileWatcherService implements IFileSystemWatcher, IGitWatcher {
  private static instance: VMFileWatcherService | null = null;
  private vmWatchers = new Map<string, VMWatchEntry>();
  private vmAgent: VMAgentClient | null = null;
  private activeVmId: string | null = null; // Track active VM for interface compliance

  private constructor() {}

  public static getInstance(): VMFileWatcherService {
    if (!VMFileWatcherService.instance) {
      VMFileWatcherService.instance = new VMFileWatcherService();
    }
    return VMFileWatcherService.instance;
  }

  public static resetInstance(): void {
    VMFileWatcherService.instance = null;
  }

  /**
   * Initialize with VM agent client
   */
  public initialize(vmAgent: VMAgentClient): void {
    this.vmAgent = vmAgent;
  }

  /**
   * Subscribe to file watching for a VM path
   */
  public async subscribe(
    cloudEnv: CloudEnvironment,
    cwd: string,
    paneId: string,
    windowId: number,
  ): Promise<void> {
    if (!this.vmAgent) {
      throw new Error(
        "VMFileWatcherService not initialized with VMAgentClient",
      );
    }

    const vmId = cloudEnv.vmId;
    let entry = this.vmWatchers.get(vmId);

    if (!entry) {
      // Create new entry and register global event listener for this VM
      entry = {
        vmId,
        cloudEnv,
        subscriptions: new Set(),
        watchedPaths: new Set(),
        gitStatusByPath: new Map(),
        currentBranchByPath: new Map(),
        baseBranchByPath: new Map(),
        gitRefreshTimers: new Map(),
        gitStatusBatchTimers: new Map(),
        pendingGitStatusFiles: new Map(),
      };
      this.vmWatchers.set(vmId, entry);

      // Register event listener once per VM
      this.vmAgent.registerEventListener(vmId, {
        onFileChanged: (event) => this.handleFileChanged(vmId, event),
        onFileRenamed: (event) => this.handleFileRenamed(vmId, event),
        onTreeChanged: (event) => this.handleTreeChanged(vmId, event),
      });
    }

    // Add subscription
    const subscription: VMSubscription = { paneId, windowId, cwd };
    entry.subscriptions.add(subscription);

    // Watch this path if not already watched
    if (!entry.watchedPaths.has(cwd)) {
      await this.vmAgent.watchDirectory(cloudEnv, cwd);
      entry.watchedPaths.add(cwd);
      console.log(
        `[VMFileWatcherService] Started watching ${cwd} on VM ${vmId}`,
      );

      // Load initial git status and branches (same as local watcher)
      try {
        const gitStatus = await this.vmAgent.getGitStatus(cloudEnv, cwd, null);
        entry.gitStatusByPath.set(cwd, gitStatus);

        const branches = await this.vmAgent.getGitBranches(cloudEnv, cwd);
        const currentBranch = branches.find((b) => b.isCurrent)?.name || null;
        entry.currentBranchByPath.set(cwd, currentBranch);

        console.log(
          `[VMFileWatcherService] Initial git status loaded for ${cwd}`,
        );

        // Broadcast initial git status
        this.broadcastGitStatusChanged(vmId, cwd);
      } catch (error) {
        console.error(
          `[VMFileWatcherService] Failed to load initial git status:`,
          error,
        );
      }
    }
  }

  /**
   * Unsubscribe from file watching
   */
  public async unsubscribe(
    cloudEnv: CloudEnvironment,
    cwd: string,
    paneId: string,
  ): Promise<void> {
    if (!this.vmAgent) {
      return;
    }

    const vmId = cloudEnv.vmId;
    const entry = this.vmWatchers.get(vmId);
    if (!entry) {
      return;
    }

    // Remove subscription
    const subscriptionsArray = Array.from(entry.subscriptions);
    for (const sub of subscriptionsArray) {
      if (sub.paneId === paneId && sub.cwd === cwd) {
        entry.subscriptions.delete(sub);
        break;
      }
    }

    // Check if any other subscriptions are watching this path
    const stillWatching = Array.from(entry.subscriptions).some(
      (sub) => sub.cwd === cwd,
    );

    // If no one is watching this path anymore, unwatch it
    if (!stillWatching && entry.watchedPaths.has(cwd)) {
      await this.vmAgent.unwatchDirectory(cloudEnv, cwd);
      entry.watchedPaths.delete(cwd);
      console.log(
        `[VMFileWatcherService] Stopped watching ${cwd} on VM ${vmId}`,
      );
    }

    // If no more subscriptions for this VM, clean up
    if (entry.subscriptions.size === 0) {
      this.vmAgent.unregisterEventListener(vmId);
      this.vmWatchers.delete(vmId);
      console.log(`[VMFileWatcherService] Cleaned up VM watcher for ${vmId}`);
    }
  }

  /**
   * Handle file changed event from VM
   */
  private handleFileChanged(vmId: string, event: FileChangedEvent): void {
    this.broadcast(vmId, event.cwd, "file-watcher:file-changed", event);

    // Check if this is a git-related file change (for branch detection)
    const basename = path.basename(event.relativePath);
    const dirname = path.dirname(event.relativePath);

    const isGitMetadataChange =
      basename === "index" ||
      basename === "HEAD" ||
      dirname.includes(".git/refs") ||
      event.relativePath.includes(".git/refs/");

    if (isGitMetadataChange) {
      console.log(
        `[VMFileWatcherService] Git metadata change detected: ${event.relativePath}`,
      );
      // Git metadata changes trigger full status refresh (like local watcher)
      this.scheduleGitStatusUpdateFull(vmId, event.cwd, 200);
    } else {
      // Regular file changes use batching (like local watcher)
      const filePath = path.join(event.cwd, event.relativePath);
      this.scheduleGitStatusUpdateFile(vmId, event.cwd, filePath);
    }
  }

  /**
   * Handle file renamed event from VM
   */
  private handleFileRenamed(vmId: string, event: FileRenamedEvent): void {
    this.broadcast(vmId, event.cwd, "file-watcher:file-renamed", event);
  }

  /**
   * Handle tree changed event from VM
   */
  private handleTreeChanged(vmId: string, event: TreeChangedEvent): void {
    this.broadcast(vmId, event.cwd, "file-watcher:tree-changed", event);

    // Tree changes trigger full status refresh (like local watcher)
    this.scheduleGitStatusUpdateFull(vmId, event.cwd, 200);
  }

  /**
   * Schedule a single-file git status update with batching (matching local watcher).
   * Collects file changes within a time window and decides whether to
   * run full git status (if many files changed) or per-file git status.
   */
  private scheduleGitStatusUpdateFile(
    vmId: string,
    cwd: string,
    filePath: string,
  ): void {
    const entry = this.vmWatchers.get(vmId);
    if (!entry) return;

    // Get or create pending files set for this cwd
    let pendingFiles = entry.pendingGitStatusFiles.get(cwd);
    if (!pendingFiles) {
      pendingFiles = new Set();
      entry.pendingGitStatusFiles.set(cwd, pendingFiles);
    }
    pendingFiles.add(filePath);

    // Clear existing batch timer
    const existingTimer = entry.gitStatusBatchTimers.get(cwd);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule batch processing after 100ms (matching local watcher)
    const timer = setTimeout(async () => {
      await this.processBatchedGitStatusUpdates(vmId, cwd);
    }, 100);

    entry.gitStatusBatchTimers.set(cwd, timer);
  }

  /**
   * Process batched git status updates (matching local watcher).
   * Decides whether to run full git status or per-file updates based on batch size.
   */
  private async processBatchedGitStatusUpdates(
    vmId: string,
    cwd: string,
  ): Promise<void> {
    const entry = this.vmWatchers.get(vmId);
    if (!entry || !this.vmAgent) return;

    const pendingFiles = entry.pendingGitStatusFiles.get(cwd);
    if (!pendingFiles || pendingFiles.size === 0) return;

    const pendingFilesArray = Array.from(pendingFiles);
    pendingFiles.clear();
    entry.gitStatusBatchTimers.delete(cwd);

    console.log(
      `[VMFileWatcherService] Processing batched git status for ${pendingFilesArray.length} files`,
    );

    // If more than 5 files changed, do full status (matching local watcher threshold)
    if (pendingFilesArray.length > 5) {
      await this.refreshGitStatus(vmId, cwd);
    } else {
      // For few files, update per-file status
      // Note: VM agent doesn't have per-file status API yet, so fall back to full status
      // This is acceptable since it's only for ≤5 files
      await this.refreshGitStatus(vmId, cwd);
    }
  }

  /**
   * Schedule a full git status update with debouncing (matching local watcher)
   */
  private scheduleGitStatusUpdateFull(
    vmId: string,
    cwd: string,
    delay: number,
  ): void {
    const entry = this.vmWatchers.get(vmId);
    if (!entry || !this.vmAgent) return;

    // Clear existing timer for this path
    const existingTimer = entry.gitRefreshTimers.get(cwd);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule refresh with specified delay
    const timer = setTimeout(async () => {
      await this.refreshGitStatus(vmId, cwd);
      entry.gitRefreshTimers.delete(cwd);
    }, delay);

    entry.gitRefreshTimers.set(cwd, timer);
  }

  /**
   * Refresh git status and branches for a VM path
   */
  private async refreshGitStatus(vmId: string, cwd: string): Promise<void> {
    const entry = this.vmWatchers.get(vmId);
    if (!entry || !this.vmAgent) return;

    try {
      console.log(`[VMFileWatcherService] Refreshing git status for ${cwd}`);

      // Get git status from VM
      const gitStatus = await this.vmAgent.getGitStatus(
        entry.cloudEnv,
        cwd,
        entry.baseBranchByPath.get(cwd) || null,
      );
      entry.gitStatusByPath.set(cwd, gitStatus);

      // Get branches to find current branch
      const branches = await this.vmAgent.getGitBranches(entry.cloudEnv, cwd);
      const currentBranch = branches.find((b) => b.isCurrent)?.name || null;
      entry.currentBranchByPath.set(cwd, currentBranch);

      console.log(`[VMFileWatcherService] Updated branch to: ${currentBranch}`);

      // Broadcast git status changed event
      this.broadcastGitStatusChanged(vmId, cwd);
    } catch (error) {
      console.error(
        `[VMFileWatcherService] Failed to refresh git status:`,
        error,
      );
    }
  }

  /**
   * Broadcast git status changed event
   */
  private broadcastGitStatusChanged(vmId: string, cwd: string): void {
    const entry = this.vmWatchers.get(vmId);
    if (!entry) return;

    const gitStatus = entry.gitStatusByPath.get(cwd) || null;

    const event: GitStatusChangedEvent = {
      cwd,
      gitStatus: gitStatus as any,
      baseBranch: entry.baseBranchByPath.get(cwd) || null,
      currentBranch: entry.currentBranchByPath.get(cwd) || null,
    };

    this.broadcast(vmId, cwd, "git:status-changed", event);
  }

  /**
   * Set the base branch for git comparison (matching local watcher API)
   */
  public async setBaseBranch(
    cloudEnv: CloudEnvironment,
    cwd: string,
    baseBranch: string | null,
  ): Promise<void> {
    if (!this.vmAgent) {
      throw new Error(
        "VMFileWatcherService not initialized with VMAgentClient",
      );
    }

    const vmId = cloudEnv.vmId;
    const entry = this.vmWatchers.get(vmId);
    if (!entry) {
      console.warn(
        `[VMFileWatcherService] No watcher found for VM ${vmId}, cannot set base branch`,
      );
      return;
    }

    console.log(
      `[VMFileWatcherService] Setting base branch to ${baseBranch} for ${cwd}`,
    );
    entry.baseBranchByPath.set(cwd, baseBranch);

    // Refresh git status with new base branch
    await this.refreshGitStatus(vmId, cwd);
  }

  /**
   * Broadcast event to subscribed windows
   */
  private broadcast(
    vmId: string,
    cwd: string,
    eventName: string,
    data: unknown,
  ): void {
    const entry = this.vmWatchers.get(vmId);
    if (!entry) {
      return;
    }

    const deadSubscriptions: VMSubscription[] = [];

    // Only send to windows that are subscribed to this specific cwd
    const subscriptionsArray = Array.from(entry.subscriptions);
    for (const subscription of subscriptionsArray) {
      if (subscription.cwd !== cwd) {
        continue;
      }

      const window = BrowserWindow.fromId(subscription.windowId);
      if (window && !window.isDestroyed()) {
        window.webContents.send(eventName, data);
      } else {
        deadSubscriptions.push(subscription);
      }
    }

    // Clean up dead subscriptions
    if (deadSubscriptions.length > 0) {
      for (const deadSub of deadSubscriptions) {
        entry.subscriptions.delete(deadSub);
      }

      // If no more subscriptions, clean up the VM entry
      if (entry.subscriptions.size === 0) {
        this.vmAgent?.unregisterEventListener(vmId);
        this.vmWatchers.delete(vmId);
        console.log(`[VMFileWatcherService] Cleaned up VM watcher for ${vmId}`);
      }
    }
  }

  // ==========================================
  // IFileSystemWatcher Interface Implementation
  // ==========================================

  /**
   * Start watching a directory (interface compliance).
   * For VM service, watching is initiated via subscribe().
   */
  public async watch(): Promise<void> {
    // VM watching is handled by subscribe() which calls vmAgent.watchDirectory
    // This method exists for interface compliance
    console.log(
      "[VMFileWatcherService] watch() called - VM watching handled by subscribe()",
    );
  }

  /**
   * Stop watching and cleanup (interface compliance).
   * For VM service, unwatching is handled via unsubscribe().
   */
  public async unwatch(): Promise<void> {
    // VM unwatching is handled by unsubscribe() which calls vmAgent.unwatchDirectory
    // This method exists for interface compliance
    console.log(
      "[VMFileWatcherService] unwatch() called - VM unwatching handled by unsubscribe()",
    );
  }

  /**
   * Subscribe to file change events (interface compliance).
   * For VM service, this is handled automatically via vmAgent event listeners.
   */
  public onFileChanged(_callback: (event: FileChangedEvent) => void): void {
    // File change events are automatically broadcast to subscribers
    // This method exists for interface compliance
    console.log(
      "[VMFileWatcherService] onFileChanged() called - events handled via vmAgent listeners",
    );
  }

  /**
   * Subscribe to file rename events (interface compliance).
   * For VM service, this is handled automatically via vmAgent event listeners.
   */
  public onFileRenamed(_callback: (event: FileRenamedEvent) => void): void {
    // File rename events are automatically broadcast to subscribers
    // This method exists for interface compliance
    console.log(
      "[VMFileWatcherService] onFileRenamed() called - events handled via vmAgent listeners",
    );
  }

  /**
   * Subscribe to tree change events (interface compliance).
   * For VM service, this is handled automatically via vmAgent event listeners.
   */
  public onTreeChanged(_callback: (event: TreeChangedEvent) => void): void {
    // Tree change events are automatically broadcast to subscribers
    // This method exists for interface compliance
    console.log(
      "[VMFileWatcherService] onTreeChanged() called - events handled via vmAgent listeners",
    );
  }

  /**
   * Check if watcher is active (interface compliance).
   */
  public isWatching(): boolean {
    return this.vmWatchers.size > 0;
  }

  /**
   * Get watched directory path (interface compliance).
   * For VM service with multiple VMs, returns the first watched path.
   */
  public getPath(): string {
    if (this.activeVmId) {
      const entry = this.vmWatchers.get(this.activeVmId);
      if (entry && entry.watchedPaths.size > 0) {
        return Array.from(entry.watchedPaths)[0];
      }
    }
    return "";
  }

  // ==========================================
  // IGitWatcher Interface Implementation
  // ==========================================

  /**
   * Subscribe to git changes (interface compliance).
   * For VM service, this is handled automatically via git status broadcasts.
   */
  public onGitChanged(_callback: () => void): void {
    // Git changes are automatically broadcast as git:status-changed events
    // This method exists for interface compliance
    console.log(
      "[VMFileWatcherService] onGitChanged() called - events handled via git status broadcasts",
    );
  }

  /**
   * Get git root directory (interface compliance).
   * For VM service with multiple paths, returns null.
   */
  public getGitRoot(): string | null {
    // VM service doesn't track a single git root since it can watch multiple VMs/paths
    // Use vmAgent.findRepoRoot() for specific paths instead
    return null;
  }

  /**
   * Compute full git status (interface compliance).
   * For VM service, delegates to vmAgent.getGitStatus().
   */
  public async computeGitStatusFull(
    baseBranch: string | null,
  ): Promise<GitStatusMap | null> {
    if (!this.vmAgent || !this.activeVmId) {
      return null;
    }

    const entry = this.vmWatchers.get(this.activeVmId);
    if (!entry || entry.watchedPaths.size === 0) {
      return null;
    }

    const cwd = Array.from(entry.watchedPaths)[0];
    try {
      const gitStatus = await this.vmAgent.getGitStatus(
        entry.cloudEnv,
        cwd,
        baseBranch,
      );
      return gitStatus as GitStatusMap;
    } catch (error) {
      console.error(
        "[VMFileWatcherService] Failed to compute git status:",
        error,
      );
      return null;
    }
  }

  /**
   * Compute git status for single file (interface compliance).
   * For VM service, not yet implemented - returns null.
   */
  public async computeGitStatusForFile(
    _filePath: string,
  ): Promise<GitFileStatus | null> {
    // VM agent doesn't currently support per-file git status
    // Falls back to full status refresh in processBatchedGitStatusUpdates
    console.log(
      "[VMFileWatcherService] computeGitStatusForFile() not implemented for VM - use full status",
    );
    return null;
  }
}
