import type { GitStatusMap } from "@shared/types";

export interface IGitWatcher {
  /**
   * Start watching git directory
   */
  watch(): Promise<void>;

  /**
   * Stop watching and cleanup
   */
  unwatch(): Promise<void>;

  /**
   * Subscribe to git changes
   */
  onGitChanged(callback: () => void): void;

  /**
   * Get git root directory
   */
  getGitRoot(): string | null;

  /**
   * Compute full git status
   */
  computeGitStatusFull(baseBranch: string | null): Promise<GitStatusMap | null>;

  /**
   * Compute git status for single file
   */
  computeGitStatusForFile(filePath: string): Promise<{ status: string } | null>;
}
