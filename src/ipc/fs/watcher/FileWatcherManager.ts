/**
 * Unified File Watcher Manager
 *
 * Provides a single interface for file watching that automatically routes
 * to either FileWatcherService (local) or VMFileWatcherService (cloud VM)
 * based on the vmId parameter.
 */

import { getCloudEnvironmentByVmId } from "../../terminal/store";
import { getVMAgentClient } from "../../vm/agent-client";
import { FileWatcherService } from "./FileWatcherService";
import { VMFileWatcherService } from "./VMFileWatcherService";

/**
 * Unified file watcher manager that routes to appropriate service
 */
export class FileWatcherManager {
  private static instance: FileWatcherManager | null = null;
  private localService: FileWatcherService;
  private vmService: VMFileWatcherService;

  private constructor() {
    this.localService = FileWatcherService.getInstance();
    this.vmService = VMFileWatcherService.getInstance();

    // Initialize VM agent for cloud VM support
    const vmAgent = getVMAgentClient();
    this.vmService.initialize(vmAgent);
  }

  public static getInstance(): FileWatcherManager {
    if (!FileWatcherManager.instance) {
      FileWatcherManager.instance = new FileWatcherManager();
    }
    return FileWatcherManager.instance;
  }

  public static resetInstance(): void {
    FileWatcherManager.instance = null;
  }

  /**
   * Subscribe to file watching for a directory.
   * Automatically routes to local or VM service based on vmId.
   *
   * @param cwd - Directory to watch
   * @param paneId - Pane identifier
   * @param windowId - Browser window ID
   * @param vmId - VM ID ('local' for local filesystem, 'vm-xxx' for cloud VM)
   */
  public async subscribe(
    cwd: string,
    paneId: string,
    windowId: number,
    vmId: string | "local",
  ): Promise<void> {
    // Check if this is for a cloud VM
    if (vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        console.log(
          `[FileWatcherManager] Routing to VM service: paneId=${paneId}, cwd=${cwd}, vmId=${vmId}`,
        );
        await this.vmService.subscribe(cloudEnv, cwd, paneId, windowId);
        return;
      }
      console.warn(
        `[FileWatcherManager] VM ${vmId} not found, falling back to local`,
      );
    }

    // Local file system subscription
    console.log(
      `[FileWatcherManager] Routing to local service: paneId=${paneId}, cwd=${cwd}`,
    );
    await this.localService.subscribe(cwd, paneId, windowId);
  }

  /**
   * Unsubscribe from file watching.
   * Automatically routes to local or VM service based on vmId.
   *
   * @param cwd - Directory being watched
   * @param paneId - Pane identifier
   * @param vmId - VM ID ('local' for local filesystem, 'vm-xxx' for cloud VM)
   */
  public async unsubscribe(
    cwd: string,
    paneId: string,
    vmId: string | "local",
  ): Promise<void> {
    // Check if this is for a cloud VM
    if (vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        console.log(
          `[FileWatcherManager] Unsubscribing from VM service: paneId=${paneId}, cwd=${cwd}`,
        );
        await this.vmService.unsubscribe(cloudEnv, cwd, paneId);
        return;
      }
    }

    // Local file system unsubscription
    console.log(
      `[FileWatcherManager] Unsubscribing from local service: paneId=${paneId}, cwd=${cwd}`,
    );
    await this.localService.unsubscribe(cwd, paneId);
  }

  /**
   * Get git status for a directory.
   * Routes to appropriate service based on vmId.
   */
  public getGitStatus(
    cwd: string,
    vmId: string | "local",
  ): Map<string, any> | null {
    if (vmId !== "local") {
      // VM service doesn't expose getGitStatus, it's handled internally
      return null;
    }
    return this.localService.getGitStatus(cwd);
  }

  /**
   * Set base branch for git comparison.
   * Routes to appropriate service based on vmId.
   */
  public async setBaseBranch(
    cwd: string,
    baseBranch: string | null,
    vmId: string | "local",
  ): Promise<void> {
    if (vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        await this.vmService.setBaseBranch(cloudEnv, cwd, baseBranch);
        return;
      }
    }
    await this.localService.setBaseBranch(cwd, baseBranch);
  }

  /**
   * Refresh git status for a directory.
   * Routes to appropriate service based on vmId.
   */
  public async refreshGitStatus(
    cwd: string,
    vmId: string | "local",
  ): Promise<void> {
    if (vmId !== "local") {
      // VM service handles refreshes internally
      return;
    }
    await this.localService.refreshGitStatus(cwd);
  }

  /**
   * Get git branches for a repository.
   * Routes to appropriate service based on vmId.
   */
  public async getBranches(
    cwd: string,
    vmId: string | "local",
  ): Promise<any[]> {
    if (vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        const vmAgent = getVMAgentClient();
        return await vmAgent.getGitBranches(cloudEnv, cwd);
      }
    }
    // For local, import and call the local git handler
    const { listBranches } = await import("../../git/gitStatus");
    return await listBranches(cwd);
  }

  /**
   * Get git diff statistics for a repository.
   * Routes to appropriate service based on vmId.
   */
  public async getDiffStats(
    cwd: string,
    vmId: string | "local",
    baseBranch?: string | null,
  ): Promise<any> {
    if (vmId && vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        const vmAgent = getVMAgentClient();
        return await vmAgent.getGitDiffStats(cloudEnv, cwd);
      }
    }
    // For local, import and call the local git handler
    const { getGitDiffStats } = await import("../../git/gitDiffStats");
    return await getGitDiffStats(cwd);
  }

  /**
   * Get the most recently modified file in a repository.
   * Routes to appropriate service based on vmId.
   */
  public async getMostRecentFile(
    cwd: string,
    vmId: string | "local",
  ): Promise<string | null> {
    if (vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        const vmAgent = getVMAgentClient();
        return await vmAgent.getMostRecentFile(cloudEnv, cwd);
      }
    }
    // For local, import and call the local git handlers
    const { getMostRecentDirtyFile, getMostRecentTrackedFile } = await import(
      "../../git/gitStatus"
    );

    // First try to find the most recent dirty file
    let file = await getMostRecentDirtyFile(cwd);

    // If no dirty files, try recently modified tracked files
    if (!file) {
      file = await getMostRecentTrackedFile(cwd);
    }

    return file;
  }

  /**
   * Get git diff for a specific file.
   * Routes to appropriate service based on vmId.
   */
  public async getFileDiff(
    filePath: string,
    cwd: string,
    vmId: string | "local",
    baseBranch?: string | null,
  ): Promise<any> {
    if (vmId && vmId !== "local") {
      const cloudEnv = getCloudEnvironmentByVmId(vmId);
      if (cloudEnv) {
        const vmAgent = getVMAgentClient();
        return await vmAgent.getFileDiff(cloudEnv, cwd, filePath, baseBranch);
      }
    }
    // For local, import and call the local git handler
    const { getFileDiff } = await import("../../git/gitDiff");
    return await getFileDiff(cwd, filePath, baseBranch);
  }
}
